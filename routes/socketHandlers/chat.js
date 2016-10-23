/*
 Copyright 2015 Aleksandar Jankovic

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

'use strict';

const dbConnector = require('../../db/databaseConnector');
const dbRoom = require('../../db/connectors/room');
const dbUser = require('../../db/connectors/user');
const dbDevice = require('../../db/connectors/device');
const manager = require('../../socketHelpers/manager');
const databasePopulation = require('../../config/defaults/config').databasePopulation;
const appConfig = require('../../config/defaults/config').app;
const logger = require('../../utils/logger');
const messenger = require('../../socketHelpers/messenger');
const objectValidator = require('../../utils/objectValidator');

/**
 * Follow a new room on the socket
 * @param {Object} params - Parameters
 * @param {Object} params.socket - Socket.IO socket
 * @param {Object} params.newRoom - New room to follow
 * @param {string} params.userName - Name of the new user following the room
 */
function followRoom({ socket, newRoom, userName }) {
  const newRoomName = newRoom.roomName;

  if (Object.keys(socket.rooms).indexOf(newRoomName) < 0) {
    messenger.sendMsg({
      socket,
      message: {
        userName: 'SYSTEM',
        text: [`${userName} started following ${newRoomName}`],
        text_se: [`${userName} började följa ${newRoomName}`],
        roomName: newRoomName,
      },
      sendTo: newRoomName,
    });
  }

  socket.join(newRoomName);
  socket.emit('follow', { room: newRoom });
  socket.emit('commandSuccess', { noStepCall: true });
}

/**
 * Should the room be hidden?
 * @static
 * @param {string} room - Room name
 * @param {string} socketId - ID of the socket
 * @returns {boolean} Should the room be hidden?
 */
function shouldBeHidden(room, socketId) {
  const hiddenRooms = [
    socketId,
    databasePopulation.rooms.important.roomName,
    databasePopulation.rooms.bcast.roomName,
    databasePopulation.rooms.morse.roomName,
  ];

  return hiddenRooms.indexOf(room) >= 0 || room.indexOf(appConfig.whisperAppend) >= 0 || room.indexOf(appConfig.deviceAppend) >= 0 || room.indexOf(appConfig.teamAppend) >= 0;
}

/**
 * @param {object} socket - Socket.IO socket
 * @param {object} io - Socket.IO
 */
function handle(socket, io) {
  socket.on('chatMsg', ({ message }, callback) => {
    if (!objectValidator.isValidData({ message }, { message: { text: true, roomName: true } })) {
      callback({ error: {} });

      return;
    }

    manager.userAllowedCommand(socket.id, databasePopulation.commands.msg.commandName, (allowErr, allowed, user) => {
      if (allowErr || !allowed) {
        callback({ error: {} });

        return;
      }

      const modifiedMessage = message;
      modifiedMessage.userName = user.userName;

      if (modifiedMessage.roomName === 'team') {
        modifiedMessage.roomName = user.team + appConfig.teamAppend;
      }

      messenger.sendChatMsg({ user, callback, message: modifiedMessage, io });
    });
  });

  socket.on('whisperMsg', ({ message }, callback) => {
    if (!objectValidator.isValidData({ message }, { message: { text: true, roomName: true, whisper: true } })) {
      callback({ error: {} });

      return;
    }

    manager.userAllowedCommand(socket.id, databasePopulation.commands.whisper.commandName, (allowErr, allowed, user) => {
      if (allowErr || !allowed) {
        callback({ error: {} });

        return;
      }

      const modifiedMessage = message;
      modifiedMessage.userName = user.userName;

      messenger.sendWhisperMsg({ socket, callback, message: modifiedMessage });
    });
  });

  socket.on('broadcastMsg', (params, callback) => {
    if (!objectValidator.isValidData(params, { message: { text: true } })) {
      callback({ error: {} });

      return;
    }

    manager.userAllowedCommand(socket.id, databasePopulation.commands.broadcast.commandName, (allowErr, allowed, user) => {
      if (allowErr || !allowed) {
        callback({ error: {} });

        return;
      }

      const message = params.message;
      message.userName = user.userName;

      messenger.sendBroadcastMsg({ socket, message, callback });
    });
  });

  socket.on('createRoom', (params, callback) => {
    if (!objectValidator.isValidData(params, { room: { roomName: true, owner: true } })) {
      callback({ error: {} });

      return;
    }

    manager.userAllowedCommand(socket.id, databasePopulation.commands.createroom.commandName, (allowErr, allowed, user) => {
      if (allowErr || !allowed || !user) {
        callback({ error: {} });

        return;
      }

      manager.createRoom(params.room, user, (createErr, room) => {
        if (createErr) {
          logger.sendSocketErrorMsg({
            socket,
            code: logger.ErrorCodes.db,
            text: ['Failed to create room'],
            text_se: ['Lyckades inte skapa rummet'],
            err: createErr,
          });
          callback({ error: {} });

          return;
        } else if (!room) {
          callback({});

          return;
        }

        callback({ room });
        followRoom({ socket, userName: user.userName, newRoom: room });
      });
    });
  });

  socket.on('follow', ({ room }) => {
    if (!objectValidator.isValidData({ room }, { room: { roomName: true } })) {
      socket.emit('commandFail');

      return;
    }

    manager.userAllowedCommand(socket.id, databasePopulation.commands.follow.commandName, (allowErr, allowed, user) => {
      if (allowErr || !allowed || !user) {
        socket.emit('commandFail');

        return;
      }

      const modifiedRoom = room;
      modifiedRoom.roomName = room.roomName.toLowerCase();

      if (room.password === undefined) {
        modifiedRoom.password = '';
      }

      dbRoom.authUserToRoom(user, modifiedRoom.roomName, modifiedRoom.password, (err, authRoom) => {
        if (err || authRoom === null) {
          logger.sendSocketErrorMsg({
            socket,
            code: logger.ErrorCodes.db,
            text: [`You are not authorized to join ${modifiedRoom.roomName}`],
            text_se: [`Ni har inte tillåtelse att gå in i rummet ${modifiedRoom.roomName}`],
            err,
          });
          socket.emit('commandFail');

          return;
        }

        dbUser.addRoomToUser(user.userName, modifiedRoom.roomName, (roomErr) => {
          if (roomErr) {
            logger.sendErrorMsg({
              code: logger.ErrorCodes.db,
              text: [`Failed to follow ${modifiedRoom.roomName}`],
              err: roomErr,
            });
            socket.emit('commandFail');

            return;
          }

          followRoom({ socket, userName: user.userName, newRoom: modifiedRoom });
        });
      });
    });
  });

  socket.on('switchRoom', ({ room }, callback) => {
    if (!objectValidator.isValidData({ room }, { room: { roomName: true } })) {
      callback({ error: {} });

      return;
    }

    manager.userAllowedCommand(socket.id, databasePopulation.commands.switchroom.commandName, (allowErr, allowed, user) => {
      if (allowErr || !allowed) {
        callback({ error: {} });

        return;
      }

      let roomName = room.roomName.toLowerCase();

      if (user.team && roomName === 'team') {
        roomName = user.team + appConfig.teamAppend;
      }

      if (Object.keys(socket.rooms).indexOf(roomName) > -1) {
        socket.emit('follow', { room });
      } else {
        messenger.sendSelfMsg({
          socket,
          message: {
            text: [`You are not following room ${roomName}`],
            text_se: [`Ni följer inte rummet ${roomName}`],
          },
        });
      }
    });
  });

  socket.on('unfollow', (params) => {
    if (!objectValidator.isValidData(params, { room: { roomName: true } })) {
      return;
    }

    manager.userAllowedCommand(socket.id, databasePopulation.commands.unfollow.commandName, (allowErr, allowed, user) => {
      if (allowErr || !allowed || !user) {
        return;
      }

      // TODO Move toLowerCase to class
      const roomName = params.room.roomName.toLowerCase();

      if (Object.keys(socket.rooms).indexOf(roomName) > -1) {
        const userName = user.userName;

        /*
         * User should not be able to unfollow its own room
         * That room is for private messaging between users
         */
        if (roomName !== userName) {
          dbUser.removeRoomFromUser(userName, roomName, (err, removedUser) => {
            if (err || removedUser === null) {
              logger.sendSocketErrorMsg({
                socket,
                code: logger.ErrorCodes.db,
                text: ['Failed to unfollow room'],
                text_se: ['Misslyckades med att följa rummet'],
                err,
              });

              return;
            }

            messenger.sendMsg({
              socket,
              message: {
                text: [`${userName} left ${roomName}`],
                text_se: [`${userName} lämnade ${roomName}`],
                roomName,
              },
              sendTo: roomName,
            });
            socket.leave(roomName);
            socket.emit('unfollow', { room: params.room });
          });
        }
      } else {
        messenger.sendSelfMsg({
          socket,
          message: {
            text: [`You are not following ${roomName}`],
            text_se: [`Ni följer inte ${roomName}`],
          },
        });
      }
    });
  });

  // Shows all available rooms
  socket.on('listRooms', () => {
    manager.userAllowedCommand(socket.id, databasePopulation.commands.list.commandName, (allowErr, allowed, user) => {
      if (allowErr || !allowed || !user) {
        return;
      }

      dbRoom.getAllRooms(user, (roomErr, rooms) => {
        if (roomErr) {
          logger.sendErrorMsg({
            code: logger.ErrorCodes.db,
            text: ['Failed to get all room names'],
            err: roomErr,
          });

          return;
        }

        if (rooms.length > 0) {
          const roomNames = [];

          for (let i = 0; i < rooms.length; i += 1) {
            roomNames.push(rooms[i].roomName);
          }

          messenger.sendSelfMsg({
            socket,
            message: {
              text: ['Rooms:', roomNames.join(' - ')],
            },
          });
        }
      });
    });
  });

  socket.on('listUsers', () => {
    manager.userAllowedCommand(socket.id, databasePopulation.commands.list.commandName, (allowErr, allowed, user) => {
      if (allowErr || !allowed || !user) {
        return;
      }

      dbUser.getAllUsers(user, (userErr, users) => {
        if (userErr || users === null) {
          logger.sendErrorMsg({
            code: logger.ErrorCodes.db,
            text: ['Failed to get all users'],
            err: userErr,
          });

          return;
        }

        if (users.length > 0) {
          const offlineUsers = [];
          const onlineUsers = [];

          for (let i = 0; i < users.length; i += 1) {
            const currentUser = users[i];

            if ((!appConfig.userVerify || currentUser.verified) && !currentUser.banned) {
              if (currentUser.online) {
                onlineUsers.push(currentUser.userName);
              } else {
                offlineUsers.push(currentUser.userName);
              }
            }
          }

          messenger.sendSelfMsg({
            socket,
            message: {
              text: [
                'Online users:',
                onlineUsers.join(' - '),
              ],
            },
          });
          messenger.sendSelfMsg({
            socket,
            message: {
              text: [
                'Other users:',
                offlineUsers.join(' - '),
              ],
            },
          });
        }
      });
    });
  });

  socket.on('myRooms', (params, callback) => {
    if (!objectValidator.isValidData(params, { user: { userName: true }, device: { deviceId: true } })) {
      return;
    }

    manager.userAllowedCommand(socket.id, databasePopulation.commands.whoami.commandName, (allowErr, allowed, user) => {
      if (allowErr || !allowed) {
        return;
      }

      const rooms = [];
      const socketRooms = Object.keys(socket.rooms);

      if (user.team) {
        rooms.push('team');
      }

      for (let i = 0; i < socketRooms.length; i += 1) {
        const room = socketRooms[i];

        if (!shouldBeHidden(room, socket.id)) {
          rooms.push(room);
        }
      }

      dbRoom.getOwnedRooms(user, (err, ownedRooms) => {
        if (err || !ownedRooms || ownedRooms === null) {
          logger.sendErrorMsg({
            code: logger.ErrorCodes.db,
            text: ['Failed to get owned rooms'],
            err,
          });

          return;
        }

        const roomNames = [];

        if (ownedRooms.length > 0) {
          for (let i = 0; i < ownedRooms.length; i += 1) {
            roomNames.push(ownedRooms[i].roomName);
          }
        }

        callback({ rooms, ownedRooms: roomNames });
      });
    });
  });

  /**
   * Get history for one to many rooms
   * @param {Object} params - Parameters
   * @param {Object} [params.room] - Room to retrieve history from. Will retrieve from all rooms if not set
   * @param {Date} [params.startDate] - Start date of retrieval
   * @param {number} [params.lines] - Number of lines to retrieve
   */
  socket.on('history', ({ room, startDate, lines }, callback) => {
    manager.userAllowedCommand(socket.id, databasePopulation.commands.history.commandName, (allowErr, allowed, user) => {
      if (allowErr || !allowed) {
        callback({ error: {} });

        return;
      }

      const modifiedRoom = room;

      if (modifiedRoom) {
        if (user.team && modifiedRoom.roomName === 'team') {
          modifiedRoom.roomName = user.team + appConfig.teamAppend;
        } else if (modifiedRoom.roomName === 'whisper') {
          modifiedRoom.roomName = user.userName + appConfig.whisperAppend;
        }

        if (Object.keys(socket.rooms).indexOf(modifiedRoom.roomName) < 0) {
          logger.sendSocketErrorMsg({
            socket,
            code: logger.ErrorCodes.general,
            text: [`${user.userName} is not following room ${modifiedRoom.roomName}. Unable to retrieve history`],
            text_se: [`${user.userName} följer inte rummet ${modifiedRoom.roomName}. Misslyckades med hämtningen av historik`],
          });
          callback({ error: {} });

          return;
        }
      }

      const allRooms = modifiedRoom ? [modifiedRoom.roomName] : Object.keys(socket.rooms);
      const historyLines = lines > appConfig.maxHistoryLines ? appConfig.maxHistoryLines : lines;

      manager.getHistory({
        rooms: allRooms,
        lines: historyLines,
        missedMsgs: false,
        lastOnline: startDate || new Date(),
        callback: (histErr, historyMessages) => {
          if (histErr) {
            logger.sendSocketErrorMsg({
              socket,
              code: logger.ErrorCodes.general,
              text: ['Unable to retrieve history'],
              text_se: ['Misslyckades med hämtningen av historik'],
              err: histErr,
            });
            callback({ error: {} });

            return;
          }

          callback({ messages: historyMessages });
        },
      });
    });
  });

  socket.on('morse', ({ local, morseCode, silent }, callback) => {
    if (!objectValidator.isValidData({ local, morseCode, silent }, { morseCode: true })) {
      callback({ error: {} });

      return;
    }

    manager.userAllowedCommand(socket.id, databasePopulation.commands.morse.commandName, (allowErr, allowed) => {
      if (allowErr || !allowed) {
        callback({ error: {} });

        return;
      }

      messenger.sendMorse({
        socket,
        local,
        message: {
          morseCode,
        },
        silent,
        callback,
      });
    });
  });

  socket.on('removeRoom', ({ room }, callback) => {
    if (!objectValidator.isValidData({ room }, { room: { roomName: true } })) {
      return;
    }

    manager.userAllowedCommand(socket.id, databasePopulation.commands.removeroom.commandName, (allowErr, allowed, user) => {
      if (allowErr || !allowed || !user) {
        callback({ error: {} });

        return;
      }

      const roomNameLower = room.roomName.toLowerCase();

      dbRoom.removeRoom(roomNameLower, user, (err, removedRoom) => {
        if (err || removedRoom === null) {
          logger.sendSocketErrorMsg({
            socket,
            code: logger.ErrorCodes.db,
            text: ['Failed to remove the room'],
            text_se: ['Misslyckades med att ta bort rummet'],
            err,
          });
          callback({ error: {} });

          return;
        }

        dbUser.removeRoomFromAllUsers(roomNameLower, (roomErr) => {
          if (roomErr) {
            logger.sendSocketErrorMsg({
              socket,
              code: logger.ErrorCodes.db,
              text: ['Failed to remove room from all users'],
              text_se: ['Misslyckades med att ta bort rummet från alla användare'],
              err: roomErr,
            });
          }

          const connectedIds = Object.keys(io.sockets.adapter.rooms[roomNameLower].sockets);
          const allSockets = io.sockets.connected;

          for (let i = 0; i < connectedIds.length; i += 1) {
            const userSocket = allSockets[connectedIds[i]];

            userSocket.leave(roomNameLower);
          }

          socket.broadcast.to(roomNameLower).emit('unfollow', { room });
        });

        messenger.sendMsg({
          socket,
          message: {
            userName: 'SYSTEM',
            text: [`Room ${roomNameLower} has been removed by the room administrator`],
            text_se: [`Rummet ${roomNameLower} har blivit borttaget av en administratör för rummet`],
          },
          sendTo: roomNameLower,
        });
        callback({});
      });
    });
  });

  socket.on('importantMsg', ({ message, morse, device }, callback) => {
    if (!objectValidator.isValidData({ message, morse, device }, { message: { text: true } })) {
      callback({ error: {} });

      return;
    }

    manager.userAllowedCommand(socket.id, databasePopulation.commands.importantmsg.commandName, (allowErr, allowed) => {
      if (allowErr || !allowed) {
        callback({ error: {} });

        return;
      }

      const morseToSend = {};

      if (morse) {
        morseToSend.socket = socket;
        morseToSend.local = morse.local;
        morseToSend.message = {
          morseCode: morse.morseCode,
        };
      }

      if (device) {
        dbDevice.getDevice(device.deviceId, (err, retrievedDevice) => {
          if (err || device === null) {
            logger.sendSocketErrorMsg({
              socket,
              code: logger.ErrorCodes.db,
              text: ['Failed to send the message to the device'],
              text_se: ['Misslyckades med att skicka meddelande till enheten'],
              err,
            });
            callback({ error: {} });

            return;
          }

          if (morse) {
            morseToSend.message.roomName = retrievedDevice.deviceId + appConfig.deviceAppend;
          }
        });
      }

      messenger.sendImportantMsg({ socket, callback, message, device });

      if (morse) {
        messenger.sendMorse({ message: morseToSend });
      }
    });
  });

  // TODO Change this, quick fix implementation
  socket.on('followPublic', () => {
    socket.join(databasePopulation.rooms.public.roomName);
  });

  socket.on('updateRoom', (params) => {
    if (!objectValidator.isValidData(params, { room: { roomName: true }, field: true, value: true })) {
      return;
    }

    manager.userAllowedCommand(socket.id, databasePopulation.commands.updateroom.commandName, (allowErr, allowed) => {
      if (allowErr || !allowed) {
        return;
      }

      const roomName = params.room.roomName;
      const field = params.field;
      const value = params.value;
      const callback = (err, room) => {
        if (err || room === null) {
          logger.sendSocketErrorMsg({
            socket,
            code: logger.ErrorCodes.db,
            text: ['Failed to update room'],
            text_se: ['Misslyckades med att uppdatera rummet'],
            err,
          });

          return;
        }

        messenger.sendSelfMsg({
          socket,
          message: {
            text: ['Room has been updated'],
            text_se: ['Rummet har uppdaterats'],
          },
        });
      };

      switch (field) {
        case 'visibility':
          dbRoom.updateRoomVisibility(roomName, value, callback);

          break;
        case 'accesslevel':
          dbRoom.updateRoomAccessLevel(roomName, value, callback);

          break;
        default:
          logger.sendSocketErrorMsg({
            socket,
            code: logger.ErrorCodes.db,
            text: [`Invalid field. Room doesn't have ${field}`],
            text_se: [`Felaktigt fält. Rum har inte fältet ${field}`],
          });

          break;
      }
    });
  });

  socket.on('matchPartialMyRoom', (params) => {
    // params.partialName is not checked if it set, to allow the retrieval of all rooms on no input

    manager.userAllowedCommand(socket.id, databasePopulation.commands.list.commandName, (allowErr, allowed, user) => {
      if (allowErr || !allowed) {
        return;
      }

      const itemList = [];
      const rooms = user.rooms;
      const partialName = params.partialName;

      if (user.team) {
        rooms.push('team');
      }

      for (let i = 0; i < rooms.length; i += 1) {
        const room = rooms[i];

        if (!shouldBeHidden(room, socket.id) && (!params.partialName || room.indexOf(partialName) === 0)) {
          itemList.push(room);
        }
      }

      if (itemList.length === 1) {
        socket.emit('matchFound', { matchedName: itemList[0] });
      } else {
        messenger.sendSelfMsg({
          socket,
          message: {
            text: [itemList.join(' - ')],
          },
        });
      }
    });
  });

  socket.on('matchPartialRoom', (params) => {
    // params.partialName is not checked if it set, to allow the retrieval of all rooms on no input

    manager.userAllowedCommand(socket.id, databasePopulation.commands.list.commandName, (allowErr, allowed, user) => {
      if (allowErr || !allowed) {
        return;
      }

      dbRoom.matchPartialRoom(params.partialName, user, (err, rooms) => {
        if (err) {
          return;
        }

        const itemList = [];
        const roomKeys = Object.keys(rooms);

        for (let i = 0; i < roomKeys.length; i += 1) {
          itemList.push(rooms[roomKeys[i]].roomName);
        }

        if (itemList.length === 1) {
          socket.emit('matchFound', { matchedName: itemList[0] });
        } else {
          messenger.sendSelfMsg({
            socket,
            message: {
              text: [itemList.join(' - ')],
            },
          });
        }
      });
    });
  });

  socket.on('inviteToRoom', ({ user, room }, callback) => {
    if (!objectValidator.isValidData({ user, room }, { user: { userName: true }, room: { roomName: true } })) {
      callback({ error: {} });

      return;
    }

    manager.userAllowedCommand(socket.id, databasePopulation.commands.inviteroom.commandName, (allowErr, allowed, allowedUser) => {
      if (allowErr || !allowed) {
        callback({ error: {} });

        return;
      }

      const userName = user.userName;
      const roomName = room.roomName;

      dbUser.getUser(userName, (userErr, invitedUser) => {
        if (userErr || invitedUser === null) {
          callback({ error: {} });

          return;
        } else if (invitedUser.rooms.indexOf(roomName) > -1) {
          callback({ error: {} });

          return;
        }

        const invitation = {
          itemName: roomName,
          time: new Date(),
          invitationType: 'room',
          sender: allowedUser.userName,
        };

        dbConnector.addInvitationToList(userName, invitation, (invErr, list) => {
          if (invErr || list !== null) {
            if (list || (invErr && invErr.code === 11000)) {
              callback({ error: { code: 11000 } });
            } else if (invErr) {
              logger.sendSocketErrorMsg({
                socket,
                code: logger.ErrorCodes.general,
                text: ['Failed to send the invite'],
                text_se: ['Misslyckades med att skicka inbjudan'],
                err: invErr,
              });
              callback({ error: {} });
            }

            return;
          }

          callback({ user: invitedUser });
        });
      });
    });
  });

  socket.on('roomAnswer', ({ invitation, accepted }) => {
    if (!objectValidator.isValidData({ invitation, accepted }, { accepted: true, invitation: { itemName: true, sender: true, invitationType: true } })) {
      return;
    }

    manager.userAllowedCommand(socket.id, databasePopulation.commands.invitations.commandName, (allowErr, allowed, allowedUser) => {
      if (allowErr || !allowed) {
        return;
      }

      const modifiedInvitation = invitation;
      const userName = allowedUser.userName;
      const roomName = modifiedInvitation.itemName;
      modifiedInvitation.time = new Date();

      if (accepted) {
        dbUser.addRoomToUser(userName, roomName, (roomErr) => {
          if (roomErr) {
            logger.sendErrorMsg({
              code: logger.ErrorCodes.db,
              text: [`Failed to follow ${roomName}`],
              err: roomErr,
            });

            return;
          }

          followRoom({
            socket,
            userName,
            newRoom: { roomName },
          });
          dbConnector.removeInvitationFromList(userName, roomName, modifiedInvitation.invitationType, () => {
          });
        });
      } else {
        dbConnector.removeInvitationFromList(userName, modifiedInvitation.itemName, modifiedInvitation.invitationType, (err, list) => {
          if (err || list === null) {
            messenger.sendSelfMsg({
              socket,
              message: {
                text: ['Failed to decline invitation'],
                text_se: ['Misslyckades med att avböja inbjudan'],
              },
            });

            return;
          }

          messenger.sendSelfMsg({
            socket,
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
