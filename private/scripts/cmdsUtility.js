/** @module */

const storage = require('./storage');
const labels = require('./labels');
const socketHandler = require('./socketHandler');
const textTools = require('./textTools');
const messenger = require('./messenger');
const commandHandler = require('./commandHandler');
const domManipulator = require('./domManipulator');

/**
 * @static
 * @type {Object}
 */
const commands = {};

commands.invitations = {
  func: () => {
    socketHandler.emit('getInvitations');
  },
  steps: [
    (data) => {
      const commandHelper = commandHandler.commandHelper;
      const sentInvitations = data.invitations;
      const text = [];
      commandHelper.data = data;

      if (sentInvitations.length > 0) {
        for (let i = 0; i < sentInvitations.length; i++) {
          const invitation = sentInvitations[i];
          const itemNumber = i + 1;

          text.push(`<${itemNumber}> Join ${invitation.invitationType} ${invitation.itemName}. Sent by ${invitation.sender}`);
        }

        messenger.queueMessage({ text: textTools.createCommandStart('Invitations').concat(text, textTools.createCommandEnd()) });
        messenger.queueMessage({
          text: ['Answer the invite with accept or decline. Example: 1 decline'],
          text_se: ['Besvara inbjudan med accept eller decline. Exempel: 1 decline'],
        });
        messenger.queueMessage({ text: labels.getText('info', 'cancel') });
        domManipulator.setInputStart('answer');
        commandHelper.onStep++;
      } else {
        messenger.queueMessage({
          text: ['You have no invitations'],
          text_se: ['Ni har inga inbjudan'],
        });
        commandHandler.resetCommand(false);
      }
    },
    (phrases) => {
      if (phrases.length > 1) {
        const itemNumber = phrases[0] - 1;
        const answer = phrases[1].toLowerCase();
        const invitation = commandHandler.commandHelper.data.invitations[itemNumber];

        if (['accept', 'a', 'decline', 'd'].indexOf(answer) > -1) {
          const accepted = ['accept', 'a'].indexOf(answer) > -1;
          const data = { accepted, invitation };

          switch (invitation.invitationType) {
            case 'team': {
              socketHandler.emit('teamAnswer', data);

              break;
            }
            case 'room': {
              socketHandler.emit('roomAnswer', data);

              break;
            }
            default: {
              break;
            }
          }

          commandHandler.resetCommand(false);
        } else {
          messenger.queueMessage({
            text: ['You have to either accept or decline the invitation'],
            text_se: ['Ni måste antingen acceptera eller avböja inbjudan'],
          });
        }
      } else {
        commandHandler.resetCommand(true);
      }
    },
  ],
  accessLevel: 13,
  category: 'basic',
  commandName: 'invitations',
};

commands.time = {
  func: () => {
    socketHandler.emit('time');
  },
  accessLevel: 13,
  category: 'basic',
  commandName: 'time',
};

commands.weather = {
  func: () => {
    socketHandler.emit('weather');
  },
  accessLevel: 1,
  category: 'basic',
  commandName: 'weather',
};

commands.mode = {
  func: (phrases, verbose) => {
    const commandChars = commandHandler.getCommandChars();
    let commandString;

    if (phrases.length > 0) {
      const newMode = phrases[0].toLowerCase();

      // TODO Refactoring. Lots of duplicate code
      if (newMode === 'chat') {
        storage.setMode(newMode);

        if (verbose === undefined || verbose) {
          commandString = 'Chat mode activated';

          messenger.queueMessage({
            text: textTools.createCommandStart(commandString).concat([
              `Prepend commands with ${commandChars.join(' or ')}, example: ${commandChars[0]}mode`,
              'Everything else written and sent will be intepreted as a chat message',
              'You will no longer need to use msg command to type chat messages',
              'Use tab or type double space to see available commands and instructions',
              textTools.createCommandEnd(commandString.length),
            ]),
            text_se: textTools.createCommandStart(commandString).concat([
              `Lägg till ${commandChars.join(' eller ')} i början av varje kommando, exempel: ${commandChars[0]}mode`,
              'Allt annat ni skriver kommer att tolkas som chatmeddelanden',
              'Ni kommer inte längre behöva använda msg-kommandot för att skriva chatmeddelanden',
              'Använd tab-knappen eller skriv in två blanksteg för att se tillgängliga kommandon och instruktioner',
              textTools.createCommandEnd(commandString.length),
            ]),
          });
        }

        socketHandler.emit('updateMode', { mode: newMode });
      } else if (newMode === 'cmd') {
        storage.setMode(newMode);

        if (verbose === undefined || verbose) {
          commandString = 'Command mode activated';

          messenger.queueMessage({
            text: textTools.createCommandStart(commandString).concat([
              `Commands can be used without ${commandChars[0]}`,
              'You have to use command msg to send messages',
              textTools.createCommandEnd(commandString.length),
            ]),
            text_se: textTools.createCommandStart(commandString).concat([
              `Kommandon kan användas utan ${commandChars[0]}`,
              'Ni måste använda msg-kommandot för att skriva chatmeddelanden',
              textTools.createCommandEnd(commandString.length),
            ]),
          });
        }

        socketHandler.emit('updateMode', { mode: newMode });
      } else {
        messenger.queueMessage({
          text: [`${newMode} is not a valid mode`],
          text_se: [`${newMode} är inte ett giltigt alternativ`],
        });
      }
    } else {
      messenger.queueMessage({
        text: [`Current mode: ${storage.getMode()}`],
        text_se: [`Nuvarande läge: ${storage.getMode()}`],
      });
    }
  },
  autocomplete: { type: 'modes' },
  accessLevel: 13,
  category: 'advanced',
  commandName: 'mode',
  options: {
    chat: { description: 'Chat mode' },
    cmd: { description: 'Command mode' },
  },
};

module.exports = commands;
