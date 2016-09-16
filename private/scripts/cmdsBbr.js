/** @module */

const textTools = require('./textTools');
const socketHandler = require('./socketHandler');
const commandHandler = require('./commandHandler');
const messenger = require('./messenger');
const domManipulator = require('./domManipulator');
const labels = require('./labels');

/**
 * @static
 * @type {Object}
 */
const commands = {};
const statsTimeoutTime = 5000;
let statsTimeout = null;

/**
 * Translates password hints and make them human readable
 * @static
 * @param {string[]} hints - Password hints
 * @return {string[]} Human readable password hints
 */
function humanReadableHints(hints) {
  const modifiedHints = [];

  /**
   * Translates a password hint and makes it human readable
   * @private
   * @param {string} hint - Password hint
   * @return {string[]} Human readable password hint
   */
  function createReadable(hint) {
    const splitHint = hint.split(' ');
    let modifiedHint = hint;

    if (splitHint[0] === 'end') {
      modifiedHint = `Password ends with: ${splitHint[1]}. `;
    } else if (splitHint[0] === 'middle') {
      modifiedHint = `Position ${parseInt(splitHint[1], 10)} in the password is: ${splitHint[2]}. `;
    } else if (splitHint[0] === 'start') {
      modifiedHint = `Password starts with: ${splitHint[1]}. `;
    } else if (splitHint[0] === 'type') {
      modifiedHint = `Password is a word of type: ${splitHint[1]}. `;
    } else if (splitHint[0] === 'length') {
      modifiedHint = `Password length is: ${splitHint[1]}. `;
    }

    return modifiedHint;
  }

  for (let i = 0; i < hints.length; i++) {
    modifiedHints.push(createReadable(hints[i]));
  }

  return modifiedHints;
}

function getStats() {
  socketHandler.emit('getStationStats');
  statsTimeout = setTimeout(getStats, statsTimeoutTime);
}

commands.creategameuser = {
  func: () => {
    messenger.queueMessage({
      text: [
        'Input user name + password to create a new game user',
        'Input "list" to list all existing game users',
        'Input "exit" when you are done',
        'Example: user1 banana',
        'Example: list',
        'Example: exit',
      ],
    });
  },
  steps: [(phrases = []) => {
    if (phrases.length > 0) {
      switch (phrases[0]) {
        case 'list': {
          socketHandler.emit('getAllGameUsers');

          break;
        }
        default: {
          if (phrases.length > 1) {
            socketHandler.emit('createGameUser', { userName: phrases[0], password: phrases[1] });
          } else {
            messenger.queueMessage({ text: ['You need to input a name and password. Example: creategameuser user1 banana'] });
          }

          break;
        }
      }
    }
  }],
  visibility: 11,
  accessLevel: 11,
  category: 'admin',
  commandName: 'creategameuser',
};

commands.creategameword = {
  func: () => {
    messenger.queueMessage({
      text: [
        'Input word to create a new game word, which will be used to fill out the hacklantern mini-game',
        'Don\'t use words that are passwords for game users!',
        'Input "list" to list all existing words',
        'Input "exit" when you are done',
        'Example: banana',
        'Example: list',
        'Example: exit',
      ],
    });
  },
  steps: [(phrases = []) => {
    if (phrases.length > 0) {
      switch (phrases[0]) {
        case 'list': {
          socketHandler.emit('getAllGamePasswords');

          break;
        }
        default: {
          socketHandler.emit('createGamePassword', { password: phrases[0] });

          break;
        }
      }
    }
  }],
  visibility: 11,
  accessLevel: 11,
  category: 'admin',
  commandName: 'creategameword',
};

commands.lantern = {
  func: (phrases = []) => {
    switch (phrases[0]) {
      case 'on': {
        socketHandler.emit('getStationStats');
        domManipulator.toggleStationStats(true);

        if (statsTimeout !== null) {
          clearInterval(statsTimeout);
        }

        statsTimeout = setTimeout(getStats, statsTimeoutTime);

        break;
      }
      case 'off': {
        domManipulator.toggleStationStats(false);
        clearInterval(statsTimeout);
        statsTimeout = null;

        break;
      }
      default: {
        messenger.queueMessage({ text: ['Incorrect option. Available options are: on, off'] });

        break;
      }
    }
  },
  options: {
    on: { description: 'Show LANTERN status' },
    off: { description: 'Hide LANTERN status' },
  },
  accessLevel: 1,
  visibility: 1,
  category: 'basic',
  commandName: 'lantern',
};

commands.hacklantern = {
  func: () => {
    commandHandler.commandHelper.data = {};
    commandHandler.commandHelper.fallbackStep = 4;

    socketHandler.emit('getGameUsersSelection', { userAmount: 1 });
  },
  steps: [
    (params = {}) => {
      const users = params.users;
      const passwords = params.passwords;
      const codeColumns = [];

      for (let i = 0; i < 2; i++) {
        codeColumns.push(textTools.createMixedArray({
          amount: 23,
          length: 27,
          upperCase: false,
          codeMode: true,
          requiredStrings: passwords[i],
        }));
      }

      domManipulator.setInputStart('lsm');
      messenger.queueMessage({ text: labels.getText('info', 'hackLanternIntro') });
      messenger.queueMessage({ text: labels.getText('info', 'cancel') });
      messenger.queueMessage({ text: [textTools.createFullLine()] });
      socketHandler.emit('getActiveStations');

      commandHandler.commandHelper.data.codeColumns = codeColumns;
      commandHandler.commandHelper.data.users = users;
    },
    (params = {}) => {
      if (params.stations) {
        const stationList = params.stations.map((station) => `[${station.id}] #${station.id} ${station.location} - Owner: ${station.owner || 'None'}`);
        commandHandler.commandHelper.data.stations = params.stations;

        messenger.queueMessage({ text: ['Available LANTERNs:'].concat(stationList) });
      }

      messenger.queueMessage({
        text: ['Input the number of your chosen LANTERN:'],
      });

      commandHandler.commandHelper.onStep++;
    },
    (phrases = ['']) => {
      const stationId = parseInt(phrases[0], 10);

      if (isNaN(stationId) || !commandHandler.commandHelper.data.stations.find((station) => station.id === stationId)) {
        messenger.queueMessage({ text: ['Incorrect choice'] });

        commandHandler.commandHelper.onStep--;
        commandHandler.triggerCommandStep();
      } else {
        const users = commandHandler.commandHelper.data.users;
        let userList = [];
        commandHandler.commandHelper.onStep++;
        commandHandler.commandHelper.data.stationId = stationId;

        for (let i = 0; i < users.length; i++) {
          const user = users[i];

          userList.push(textTools.createFullLine());
          userList.push(`User: ${user.userName}`);
          userList.push('Gathered password information:');
          userList = userList.concat(humanReadableHints(user.hints));
        }

        commandHandler.triggerCommand({ cmd: 'clear' });
        messenger.queueMessage({
          text: [
            `Accessing LANTERN ${stationId}...`,
            'Users with authorization to access the LANTERN:',
          ].concat(userList),
        });
        messenger.queueMessage({
          text: [
            textTools.createFullLine(),
            'Press enter to continue. Prepare to receive memory dumps',
          ],
        });
      }
    },
    () => {
      const codeColumns = commandHandler.commandHelper.data.codeColumns;

      commandHandler.triggerCommand({ cmd: 'clear' });
      messenger.queueMessage({
        text: [
          'Dumping and translating memory content...',
          textTools.createFullLine(),
        ],
      });
      messenger.queueMessage({ text: codeColumns.shift() });

      if (codeColumns.length === 0) {
        commandHandler.commandHelper.onStep++;
      }
    },
    (params = {}) => {
      commandHandler.commandHelper.onStep++;

      if (!params.reset) {
        commandHandler.triggerCommand({ cmd: 'clear' });
        messenger.queueMessage({
          text: [
            'Memory dump done',
            'All traces cleared',
            'Input authorized user:',
          ],
        });
      } else {
        messenger.queueMessage({
          text: ['Input authorized user:'],
        });
      }

      domManipulator.setInputStart('authUsr');
    },
    (phrases = ['']) => {
      if (!phrases) {
        domManipulator.setInputStart('authUsr');
        messenger.queueMessage({
          text: [
            'Incorrect user and/or password',
            'Lockdown will initiate with too many failed attempts',
            'Input authorized user:',
          ],
        });
      } else {
        commandHandler.commandHelper.data.gameUser = { userName: phrases[0].toLowerCase() };
        commandHandler.commandHelper.onStep++;

        domManipulator.setInputStart('passwd');
        messenger.queueMessage({ text: ['Input password:'] });
      }
    },
    (phrases = ['']) => {
      commandHandler.commandHelper.data.gameUser.password = phrases[0];
      commandHandler.commandHelper.onStep++;

      domManipulator.setInputStart('choice');
      messenger.queueMessage({
        text: [
          'Which command do you want to trigger?',
          'Enter the number of your choice:',
          '[1] Amplify signal',
          '[2] Dampen signal',
        ],
      });
    },
    (phrases = ['']) => {
      const validOptions = ['1', '2'];

      if (!phrases || validOptions.indexOf(phrases[0]) === -1) {
        messenger.queueMessage({
          text: [
            'Incorrect choice',
            'Which command do you want to trigger?',
            'Enter the number of your choice:',
            '[1] Amplify signal',
            '[2] Dampen signal',
          ],
        });
      } else {
        commandHandler.commandHelper.data.choice = phrases[0];
        commandHandler.commandHelper.onStep++;

        socketHandler.emit('manipulateStation', commandHandler.commandHelper.data);
      }
    },
  ],
  accessLevel: 1,
  visibility: 1,
  category: 'basic',
  commandName: 'hacklantern',
};

module.exports = commands;
