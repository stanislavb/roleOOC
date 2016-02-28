'use strict';

const dbConnector = require('../../databaseConnector');
const databasePopulation = require('rolehaven-config').databasePopulation;
const manager = require('../../manager');
const logger = require('../../logger');
const objectValidator = require('../../objectValidator');
const messenger = require('../../messenger');
const appConfig = require('rolehaven-config').app;

function updateUserTeam(socket, userName, teamName, callback) {
  dbConnector.updateUserTeam(userName, teamName, function(err, user) {
    if (err || user === null) {
      logger.sendSocketErrorMsg({
        socket: socket,
        code: logger.ErrorCodes.general,
        text: ['Failed to add member ' + userName + ' to team ' + teamName],
        text_se: ['Misslyckades med att lägga till medlem ' + userName + ' till teamet ' + teamName],
        err: err,
      });
    } else {
      messenger.sendMsg({
        socket: socket,
        message: {
          text: ['You have been added to the team ' + teamName],
          text_se: ['Ni har blivit tillagd i teamet ' + teamName],
          userName: 'SYSTEM',
        },
        sendTo: userName + appConfig.whisperAppend,
      });
    }

    if (callback) {
      callback(err, user);
    }
  });
}

function getTeam(socket, user, callback) {
  dbConnector.getTeam(user.team, function(err, team) {
    let newErr;

    if (err || team === null) {
      logger.sendSocketErrorMsg({
        socket: socket,
        code: logger.ErrorCodes.general,
        text: ['Failed to get team'],
        err: err,
      });
      newErr = {};
    }

    callback(newErr, team);
  });
}

function handle(socket) {
  socket.on('getTeam', function() {
    manager.userAllowedCommand(socket.id, databasePopulation.commands.inviteteam.commandName, function(allowErr, allowed, user) {
      if (allowErr || !allowed) {
        return;
      }

      getTeam(socket, user, function(err) {
        if (err) {
          return;
        }
      });
    });
  });

  socket.on('teamExists', function(data) {
    if (!objectValidator.isValidData(data, { team: { teamName: true } })) {
      socket.emit('commandFail');

      return;
    }

    manager.userAllowedCommand(socket.id, databasePopulation.commands.createteam.commandName, function(allowErr, allowed) {
      if (allowErr || !allowed) {
        socket.emit('commandFail');

        return;
      }

      dbConnector.getTeam(data.team.teamName, function(err, foundTeam) {
        if (err) {
          logger.sendSocketErrorMsg({
            socket: socket,
            code: logger.ErrorCodes.db,
            text: ['Failed to check if team exists'],
            text_se: ['Misslyckades med att försöka hitta teamet'],
            err: err,
          });
          socket.emit('commandFail');

          return;
        } else if (foundTeam !== null) {
          messenger.sendSelfMsg({
            socket: socket,
            message: {
              text: ['Team with that name already exists'],
              text_se: ['Ett team med det namnet existerar redan'],
            },
          });
          socket.emit('commandFail');

          return;
        }

        socket.emit('commandSuccess', { freezeStep: true });
      });
    });
  });

  socket.on('inviteToTeam', function(data) {
    if (!objectValidator.isValidData(data, { user: { userName: true } })) {
      return;
    }

    manager.userAllowedCommand(socket.id, databasePopulation.commands.inviteteam.commandName, function(allowErr, allowed, user) {
      if (allowErr || !allowed) {
        return;
      }

      getTeam(socket, user, function(err, team) {
        if (err) {
          return;
        } else if (team.owner !== user.userName && team.admins.indexOf(user.userName) === -1) {
          logger.sendSocketErrorMsg({
            socket: socket,
            code: logger.ErrorCodes.general,
            text: ['You are not an admin of the team. You are not allowed to add new team members'],
            text_se: ['Ni är inte en admin av teamet. Ni har inte tillåtelse att lägga till nya medlemmar'],
            err: err,
          });

          return;
        }

        const userName = data.user.userName;

        dbConnector.getUser(userName, function(userErr, invitedUser) {
          if (userErr) {
            return;
          } else if (invitedUser.team) {
            messenger.sendSelfMsg({
              socket: socket,
              message: {
                text: ['The user is already part of a team'],
                text_se: ['Användaren är redan med i ett team'],
              },
            });

            return;
          }

          const invitation = {
            itemName: user.team,
            time: new Date(),
            invitationType: 'team',
            sender: user.userName,
          };

          dbConnector.addInvitationToList(userName, invitation, function(invErr, list) {
            if (invErr || list !== null) {
              if (list || invErr.code === 11000) {
                messenger.sendSelfMsg({
                  socket: socket,
                  message: {
                    text: ['You have already sent an invite to the user'],
                    text_se: ['Ni har redan skickat en inbjudan till användaren'],
                  },
                });
              } else {
                logger.sendSocketErrorMsg({
                  socket: socket,
                  code: logger.ErrorCodes.general,
                  text: ['Failed to send the invite'],
                  text_se: ['Misslyckades med att skicka inbjudan'],
                  err: err,
                });
              }

              return;
            }

            messenger.sendSelfMsg({
              socket: socket,
              message: {
                text: ['Sent an invitation to the user'],
                text_se: ['Skickade en inbjudan till användaren'],
              },
            });
          });
        });
      });
    });
  });

  socket.on('createTeam', function(data) {
    if (!objectValidator.isValidData(data, { team: { teamName: true, owner: true } })) {
      return;
    }

    function addRoom(userName, roomName) {
      dbConnector.addRoomToUser(userName, roomName, function(roomErr) {
        if (roomErr) {
          logger.sendErrorMsg({
            code: logger.ErrorCodes.db,
            text: ['Failed to follow team room'],
            text_se: ['Misslyckades med att följa team-rummet'],
            err: roomErr,
          });

          return;
        }

        socket.join(roomName);
        socket.emit('follow', { room: { roomName: 'team' } });
      });
    }

    manager.userAllowedCommand(socket.id, databasePopulation.commands.createteam.commandName, function(allowErr, allowed, allowedUser) {
      if (allowErr || !allowed) {
        return;
      } else if (allowedUser.team) {
        messenger.sendSelfMsg({
          socket: socket,
          message: {
            text: ['You are already a member of a team. Failed to create team'],
            text_se: ['Ni är redan medlem i ett team. Misslyckades med att skapa teamet'],
          },
        });

        return;
      }

      const teamName = data.team.teamName;
      const owner = data.team.owner;
      const admins = data.team.admins;

      dbConnector.getUser(owner, function(userErr, user) {
        if (userErr) {
          logger.sendSocketErrorMsg({
            socket: socket,
            code: logger.ErrorCodes.db,
            text: ['Failed to create team'],
            text_se: ['Misslyckades med att skapa teamet'],
            err: userErr,
          });

          return;
        } else if (user === null) {
          logger.sendSocketErrorMsg({
            socket: socket, code: logger.ErrorCodes.general,
            text: ['User with the name ' + owner + ' does not exist. Failed to create team'],
            text_se: ['Användare med namnet ' + owner + ' existerar inte. Misslyckades med att skapa teamet'],
          });

          return;
        }

        dbConnector.addTeam(data.team, function(err, team) {
          if (err || team === null) {
            logger.sendSocketErrorMsg({
              socket: socket,
              code: logger.ErrorCodes.db,
              text: ['Failed to create team'],
              text_se: ['Misslyckades med att skapa teamet'],
              err: err,
            });

            return;
          }

          const teamRoom = {
            roomName: team.teamName + appConfig.teamAppend,
            accessLevel: databasePopulation.accessLevels.superUser,
            visibility: databasePopulation.accessLevels.superUser,
          };

          dbConnector.createRoom(teamRoom, databasePopulation.users.superuser, function(errRoom, room) {
            if (errRoom || room === null) {
              return;
            }

            messenger.sendSelfMsg({
              socket: socket,
              message: {
                text: ['Team has been created'],
                text_se: ['Teamet har skapats'],
              },
            });
            updateUserTeam(socket, owner, teamName);
            addRoom(user.userName, teamRoom.roomName);

            if (admins) {
              for (let i = 0; i < admins.length; i++) {
                updateUserTeam(socket, admins[i], teamName);
                addRoom(admins[i], teamRoom.roomName);
              }
            }
          });
        });
      });
    });
  });

  socket.on('teamAnswer', function(data) {
    if (!objectValidator.isValidData(data, { accepted: true, invitation: { itemName: true, sender: true, invitationType: true } })) {
      return;
    }

    manager.userAllowedCommand(socket.id, databasePopulation.commands.invitations.commandName, function(allowErr, allowed, allowedUser) {
      if (allowErr || !allowed) {
        console.log(allowErr, allowed);
        return;
      }

      const userName = allowedUser.userName;
      const invitation = data.invitation;
      const roomName = data.invitation.itemName + appConfig.teamAppend;
      invitation.time = new Date();

      if (data.accepted) {
        updateUserTeam(socket, userName, invitation.itemName, function(err, user) {
          if (err || user === null) {
            return;
          }

          dbConnector.addRoomToUser(userName, roomName, function(errRoom) {
            if (errRoom) {
              return;
            }

            messenger.sendSelfMsg({
              socket: socket,
              message: {
                text: ['Joined team ' + invitation.itemName],
                text_se: ['Gick med i team ' + invitation.itemName],
              },
            });

            dbConnector.removeInvitationTypeFromList(userName, invitation.invitationType, function(teamErr) {
              if (teamErr) {
                logger.sendErrorMsg({
                  code: logger.ErrorCodes.db,
                  text: ['Failed to remove all invitations of type ' + invitation.invitationType],
                  text_se: ['Misslyckades med att ta bort alla inbjudan av typen ' + invitation.invitationType],
                  err: teamErr,
                });

                return;
              }
            });

            socket.join(roomName);
            socket.emit('follow', { room: { roomName: 'team' } });
          });
        });
      } else {
        dbConnector.removeInvitationFromList(userName, invitation.itemName, invitation.invitationType, function(err, list) {
          if (err || list === null) {
            messenger.sendSelfMsg({
              socket: socket,
              message: {
                text: ['Failed to decline invitation'],
                text_se: ['Misslyckades med att avböja inbjudan'],
              },
            });

            return;
          }

          // TODO Send message to sender of invitation

          messenger.sendSelfMsg({
            socket: socket,
            message: {
              text: ['Successfully declined invitation'],
              text_se: ['Lyckades avböja inbjudan'],
            },
          });
        });
      }
    });
  });
}

exports.handle = handle;
