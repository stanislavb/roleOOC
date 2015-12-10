'use strict';

const dbConnector = require('../../databaseConnector');
const manager = require('../../manager');
const dbDefaults = require('../../config/dbPopDefaults');
const appConfig = require('../../config/appConfig');
const logger = require('../../logger');
const messenger = require('../../messenger');

function followRoom(params) {
  const socket = params.socket;
  const newRoom = params.newRoom;
  const newRoomName = newRoom.roomName;

  if (socket.rooms.indexOf(newRoom) < 0) {
    messenger.sendMsg({
      socket: socket,
      message: {
        text: [params.userName + ' is following ' + newRoomName],
        roomName: newRoomName,
      },
    });
  }

  socket.join(newRoomName);
  socket.emit('follow', newRoom);
}

function handle(socket) {
  socket.on('chatMsg', function(data) {
    manager.userAllowedCommand(socket.id, dbDefaults.commands.msg.commandName, function(allowErr, allowed) {
      if (allowErr || !allowed) {
        return;
      }

      if (data.message.whisper) {
        messenger.sendWhisperMsg({ socket: socket, message: data.message });
      } else {
        messenger.sendChatMsg({ socket: socket, message: data.message });
      }
    });
  });

  socket.on('broadcastMsg', function(data) {
    manager.userAllowedCommand(socket.id, dbDefaults.commands.broadcast.commandName, function(allowErr, allowed) {
      if (allowErr || !allowed) {
        return;
      }

      messenger.sendBroadcastMsg({ socket: socket, message: data.message });
    });
  });

  socket.on('createRoom', function(data) {
    manager.userAllowedCommand(socket.id, dbDefaults.commands.createroom.commandName, function(allowErr, allowed, user) {
      if (allowErr || !allowed || !user) {
        return;
      }

      manager.createRoom(data.room, user, function(createErr, roomName) {
        if (createErr) {
          logger.sendSocketErrorMsg(socket, logger.ErrorCodes.db, 'Failed to create room', createErr);

          return;
        } else if (!roomName) {
          messenger.sendSelfMsg({
            socket: socket,
            message: { text: ['Failed to create room. A room with that name already exists'] },
          });

          return;
        }

        const room = {};
        room.roomName = roomName;

        messenger.sendSelfMsg({
          socket: socket,
          message: { text: ['Room has been created'] },
        });
        followRoom({ socket: socket, userName: user.userName, newRoom: room });
      });
    });
  });

  socket.on('follow', function(data) {
    manager.userAllowedCommand(socket.id, dbDefaults.commands.follow.commandName, function(allowErr, allowed, user) {
      if (allowErr || !allowed || !user) {
        return;
      }

      const roomName = data.room.roomName.toLowerCase();
      // TODO Move toLowerCase to class
      data.room.roomName = roomName;

      if (data.room.password === undefined) {
        data.room.password = '';
      }

      dbConnector.authUserToRoom(user, roomName, data.room.password, function(err, room) {
        if (err || room === null) {
          logger.sendSocketErrorMsg(socket, logger.ErrorCodes.db, 'You are not authorized to join ' + roomName, err);

          return;
        }

        dbConnector.addRoomToUser(user.userName, room.roomName, function(roomErr) {
          if (roomErr) {
            logger.sendErrorMsg(logger.ErrorCodes.db, 'Failed to follow ' + roomName, roomErr);

            return;
          }

          if (data.entered) {
            room.entered = true;
          }

          followRoom({ socket: socket, userName: user.userName, newRoom: room });
        });
      });
    });
  });

  socket.on('switchRoom', function(data) {
    manager.userAllowedCommand(socket.id, dbDefaults.commands.switchroom.commandName, function(allowErr, allowed) {
      if (allowErr || !allowed) {
        return;
      }

      // TODO Move toLowerCase to class
      data.room.roomName = data.room.roomName.toLowerCase();

      if (socket.rooms.indexOf(data.room.roomName) > 0) {
        socket.emit('follow', data.room);
      } else {
        messenger.sendSelfMsg({
          socket: socket,
          message: { text: ['You are not following room ' + data.room.roomName] },
        });
      }
    });
  });

  socket.on('unfollow', function(data) {
    manager.userAllowedCommand(socket.id, dbDefaults.commands.unfollow.commandName, function(allowErr, allowed, user) {
      if (allowErr || !allowed || !user) {
        return;
      }

      // TODO Move toLowerCase to class
      const roomName = data.room.roomName.toLowerCase();

      if (socket.rooms.indexOf(roomName) > -1) {
        const userName = user.userName;

        /*
         * User should not be able to unfollow its own room
         * That room is for private messaging between users
         */
        if (roomName !== userName) {
          dbConnector.removeRoomFromUser(userName, roomName, function(err, removedUser) {
            if (err || removedUser === null) {
              logger.sendSocketErrorMsg(socket, logger.ErrorCodes.db, 'Failed to unfollow room', err);

              return;
            }

            messenger.sendMsg({
              socket: socket,
              message: { text: [userName + ' left ' + roomName], roomName: roomName },
            });
            socket.leave(roomName);
            socket.emit('unfollow', data.room);
          });
        }
      } else {
        messenger.sendSelfMsg({
          socket: socket,
          message: { text: ['You are not following ' + roomName] },
        });
      }
    });
  });

  // Shows all available rooms
  socket.on('listRooms', function() {
    manager.userAllowedCommand(socket.id, dbDefaults.commands.list.commandName, function(allowErr, allowed, user) {
      if (allowErr || !allowed || !user) {
        return;
      }

      dbConnector.getAllRooms(user, function(roomErr, rooms) {
        if (roomErr) {
          logger.sendErrorMsg(logger.ErrorCodes.db, 'Failed to get all room names', roomErr);

          return;
        }

        if (rooms.length > 0) {
          let roomsString = '';

          for (let i = 0; i < rooms.length; i++) {
            roomsString += rooms[i].roomName + '\t';
          }

          messenger.sendSelfMsg({
            socket: socket,
            message: {
              text: [
                '--------------',
                '  List rooms',
                '--------------',
                roomsString,
              ],
            },
          });
        }
      });
    });
  });

  socket.on('listUsers', function() {
    manager.userAllowedCommand(socket.id, dbDefaults.commands.list.commandName, function(allowErr, allowed, user) {
      if (allowErr || !allowed || !user) {
        return;
      }

      dbConnector.getAllUsers(user, function(userErr, users) {
        if (userErr || users === null) {
          logger.sendErrorMsg(logger.ErrorCodes.db, 'Failed to get all users', userErr);

          return;
        }

        if (users.length > 0) {
          let usersString = '';
          let onlineString = '';

          for (let i = 0; i < users.length; i++) {
            const currentUser = users[i];

            if (currentUser.verified && !currentUser.banned) {
              if (currentUser.online) {
                onlineString += currentUser.userName;
                onlineString += '\t';
              } else {
                usersString += currentUser.userName;
                usersString += '\t';
              }
            }
          }

          messenger.sendSelfMsg({
            socket: socket,
            message: {
              text: [
                '--------------',
                '  List users',
                '--------------------',
                '  Currently online',
                '--------------------',
                onlineString,
                '-----------------',
                '  Other users',
                '-----------------',
                usersString,
              ],
            },
          });
        }
      });
    });
  });

  // TODO Data structure. data.user.userName?
  socket.on('myRooms', function(data) {
    function shouldBeHidden(room) {
      const hiddenRooms = [
        socket.id,
        data.user.userName + dbDefaults.whisper,
        data.device.deviceId + dbDefaults.device,
        dbDefaults.rooms.important.roomName,
        dbDefaults.rooms.broadcast.roomName,
      ];

      return hiddenRooms.indexOf(room) >= 0;
    }

    manager.userAllowedCommand(socket.id, dbDefaults.commands.myrooms.commandName, function(allowErr, allowed, user) {
      if (allowErr || !allowed) {
        return;
      }

      const rooms = [];

      for (let i = 0; i < socket.rooms.length; i++) {
        const room = socket.rooms[i];

        if (!shouldBeHidden(room)) {
          rooms.push(room);
        }
      }

      messenger.sendSelfMsg({
        socket: socket,
        message: {
          text: [
            '------------',
            '  My rooms',
            '------------',
            'You are following rooms:',
            rooms.join('\t'),
          ],
        },
      });

      dbConnector.getOwnedRooms(user, function(err, ownedRooms) {
        if (err || ownedRooms === null) {
          logger.sendErrorMsg(logger.ErrorCodes.db, 'Failed to get owned rooms', err);

          return;
        }

        let ownedRoomsString = '';

        for (let i = 0; i < ownedRooms.length; i++) {
          ownedRoomsString += ownedRooms[i].roomName + '\t';
        }

        if (ownedRoomsString.length > 0) {
          messenger.sendSelfMsg({
            socket: socket,
            message: {
              text: [
                'You are owner of the rooms:',
                ownedRoomsString,
              ],
            },
          });
        }
      });
    });
  });

  socket.on('history', function(data) {
    manager.userAllowedCommand(socket.id, dbDefaults.commands.history.commandName, function(allowErr, allowed) {
      if (allowErr || !allowed) {
        return;
      }

      const allRooms = socket.rooms;
      const startDate = data.startDate || new Date();

      manager.getHistory(allRooms, data.lines, false, startDate, function(histErr, historyMessages) {
        if (histErr) {
          logger.sendSocketErrorMsg(socket, logger.ErrorCodes.general, 'Unable to retrieve history', histErr);

          return;
        }

        while (historyMessages.length > 0) {
          messenger.sendSelfMsgs({ socket: socket, messages: historyMessages.splice(0, appConfig.chunkLength) });
        }
      });
    });
  });

  // TODO morse class?
  socket.on('morse', function(data) {
    manager.userAllowedCommand(socket.id, dbDefaults.commands.morse.commandName, function(allowErr, allowed) {
      if (allowErr || !allowed) {
        return;
      }

      if (!data.local) {
        socket.broadcast.emit('morse', data.morseCode);
      }

      socket.emit('morse', data.morseCode);
    });
  });

  socket.on('removeRoom', function(data) {
    manager.userAllowedCommand(socket.id, dbDefaults.commands.removeroom.commandName, function(allowErr, allowed, user) {
      if (allowErr || !allowed || !user) {
        return;
      }

      const roomNameLower = data.room.roomName.toLowerCase();

      dbConnector.removeRoom(roomNameLower, user, function(err, room) {
        if (err || room === null) {
          logger.sendSocketErrorMsg(socket, logger.ErrorCodes.db, 'Failed to remove the room', err);

          return;
        }

        messenger.sendSelfMsg({ socket: socket, message: { text: ['Removed the room'] } });
      });
    });
  });

  socket.on('importantMsg', function(data) {
    manager.userAllowedCommand(socket.id, dbDefaults.commands.importantmsg.commandName, function(allowErr, allowed) {
      if (allowErr || !allowed) {
        return;
      }

      if (data.device) {
        dbConnector.getDevice(data.device, function(err, device) {
          if (err || device === null) {
            logger.sendSocketErrorMsg(socket, logger.ErrorCodes.db, 'Failed to send the message to the device', err);

            return;
          }

          data.roomName = device.deviceId + dbDefaults.device;

          messenger.sendImportantMsg({ socket: socket, message: data.message, toOneDevice: true });
        });
      } else {
        messenger.sendImportantMsg({ socket: socket, message: data.message });
      }
    });
  });

  // TODO Change this, quick fix implementation
  socket.on('followPublic', function() {
    socket.join(dbDefaults.rooms.public.roomName);
  });

  socket.on('updateRoom', function(data) {
    manager.userAllowedCommand(socket.id, dbDefaults.commands.updateroom.commandName, function(allowErr, allowed) {
      if (allowErr || !allowed) {
        return;
      }

      const roomName = data.room.roomName;
      const field = data.field;
      const value = data.value;
      const callback = function(err, room) {
        if (err || room === null) {
          logger.sendSocketErrorMsg(socket, logger.ErrorCodes.db, 'Failed to update room', err);

          return;
        }

        messenger.sendSelfMsg({
          socket: socket,
          message: { text: ['Room has been updated'] },
        });
      };

      switch (field) {
      case 'visibility':
        dbConnector.updateRoomVisibility(roomName, value, callback);

        break;
      case 'accesslevel':
        dbConnector.updateRoomAccessLevel(roomName, value, callback);

        break;
      default:
        logger.sendSocketErrorMsg(socket, logger.ErrorCodes.db, 'Invalid field. Room doesn\'t have ' + field);

        break;
      }
    });
  });
}

exports.handle = handle;
