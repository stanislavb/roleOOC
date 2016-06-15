const storage = require('./storage');

/**
 * Socket.IO
 */
const socket = io(); // eslint-disable-line no-undef
/**
 * Focus can sometimes trigger twice, which is used to check if a reconnection
 * is needed. This flag will be set to true while it is reconnecting to
 * block the second attempt
 */
let reconnecting = false;

function startSocket(events) {
  if (socket) {
    for (const event of Object.keys(events)) {
      socket.on(event, events[event]);
    }
  }
}

function reconnect() {
  const user = storage.getUser();

  if (!reconnecting) {
    reconnecting = true;

    socket.disconnect();
    socket.connect({ forceNew: true });
    socket.emit('updateId', {
      user: { userName: user },
      device: { deviceId: storage.getDeviceId },
    });
  }
}

function emit(event, params) {
  socket.emit(event, params);
}

function getSocket() {
  return socket;
}

function setReconnecting(isRecon) {
  reconnecting = isRecon;
}

exports.reconnect = reconnect;
exports.emit = emit;
exports.getSocket = getSocket;
exports.setReconnecting = setReconnecting;
exports.startSocket = startSocket;
