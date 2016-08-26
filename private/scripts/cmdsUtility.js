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
      const sentInvitations = data.invitations;
      const text = [];
      commandHandler.commandHelper.data = data;

      if (sentInvitations && sentInvitations.length > 0) {
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
        commandHandler.commandHelper.onStep++;
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
  category: 'extra',
  commandName: 'mode',
  options: {
    chat: { description: 'Chat mode' },
    cmd: { description: 'Command mode' },
  },
};

commands.create = {
  func: (phrases = ['']) => {
    if (phrases.length > 0) {
      const choice = phrases[0];

      switch (choice) {
        case 'room': {
          commandHandler.triggerCommand({ cmd: 'createroom', cmdParams: phrases.slice(1) });

          break;
        }
        case 'team': {
          commandHandler.triggerCommand({ cmd: 'createteam', cmdParams: phrases.slice(1) });

          break;
        }
        case 'mission': {
          commandHandler.triggerCommand({ cmd: 'createmission', cmdParams: phrases.slice(1) });

          break;
        }
        default: {
          messenger.queueMessage({ text: ['Incorrect option. Available options are: room, team. Example: create room r552'] });

          break;
        }
      }
    } else {
      messenger.queueMessage({ text: ['Incorrect option. Available options are: room, team. Example: create room r552'] });
    }
  },
  accessLevel: 1,
  visibility: 1,
  category: 'basic',
  commandName: 'create',
  options: {
    room: { description: 'Create a room' },
    team: { description: 'Create a team' },
  },
};

commands.remove = {
  func: (phrases = ['']) => {
    if (phrases.length > 0) {
      const choice = phrases[0];

      switch (choice) {
        case 'room': {
          commandHandler.triggerCommand({ cmd: 'removeroom', cmdParams: phrases.slice(1) });

          break;
        }
        default: {
          messenger.queueMessage({ text: ['Incorrect option. Available options are: room. Example: remove room r552'] });

          break;
        }
      }
    } else {
      messenger.queueMessage({ text: ['Incorrect option. Available options are: room. Example: remove room r552'] });
    }
  },
  accessLevel: 1,
  visibility: 1,
  category: 'basic',
  commandName: 'remove',
  options: {
    room: { description: 'Remove a room' },
  },
};

commands.invite = {
  func: (phrases = ['']) => {
    if (phrases.length > 0) {
      const choice = phrases[0];

      switch (choice) {
        case 'room': {
          commandHandler.triggerCommand({ cmd: 'inviteroom', cmdParams: phrases.slice(1) });

          break;
        }
        case 'team': {
          commandHandler.triggerCommand({ cmd: 'inviteteam', cmdParams: phrases.slice(1) });

          break;
        }
        default: {
          messenger.queueMessage({ text: ['Incorrect option. Available options are: room, team. Example: invite room user1'] });

          break;
        }
      }
    } else {
      messenger.queueMessage({ text: ['Incorrect option. Available options are: room, team. Example: invite room user1'] });
    }
  },
  accessLevel: 1,
  visibility: 1,
  category: 'basic',
  commandName: 'invite',
  options: {
    room: { description: 'Invite a user to a room you are following' },
    team: { description: 'Invite a user to your team' },
  },
};

commands.archives = {
  func: (phrases = ['']) => {
    if (phrases.length > 0) {
      const option = phrases[0];

      switch (option) {
        case 'list': {
          socketHandler.emit('getArchivesList');

          break;
        }
        default: {
          socketHandler.emit('getArchive', { archiveId: option });

          break;
        }
      }
    } else {
      messenger.queueMessage({ text: ['You need to enter an ID. Example: archives 55612'] });
    }
  },
  accessLevel: 1,
  visibility: 1,
  category: 'basic',
  commandName: 'archives',
  options: {
    list: { description: 'List public archive' },
  },
};

commands.leave = {
  func: (phrases = ['']) => {
    if (phrases.length > 0) {
      const choice = phrases[0];

      switch (choice) {
        case 'room': {
          commandHandler.triggerCommand({ cmd: 'unfollow', cmdParams: phrases.slice(1) });

          break;
        }
        case 'team': {
          socketHandler.emit('leaveTeam');

          break;
        }
        default: {
          messenger.queueMessage({ text: ['Incorrect option. Available options are: room, team'] });

          break;
        }
      }
    } else {
      messenger.queueMessage({ text: ['Incorrect option. Available options are: room, team'] });
    }
  },
  accessLevel: 1,
  visibility: 1,
  category: 'basic',
  commandName: 'leave',
  options: {
    room: { description: 'Unfollow a room' },
    team: { description: 'Leave your current team' },
  },
};

module.exports = commands;
