'use strict';

const dbConnector = require('../../databaseConnector');
const databasePopulation = require('rolehaven-config').databasePopulation;
const manager = require('../../manager');
const logger = require('../../logger');

function updateUserTeam(socket, userName, teamName) {
  dbConnector.updateUserTeam(userName, teamName, function(err, user) {
    if (err || user === null) {
      logger.sendSocketErrorMsg({
        socket: socket,
        code: logger.ErrorCodes.general,
        text: ['Failed to add member to team'],
        text_se: ['Misslyckades med att lägga till medlem till teamet'],
        err: err,
      });
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
        text: ['Failed'],
        err: err,
      });
      newErr = {};
    }

    callback(newErr, team);
  });
}

function handle(socket) {
  socket.on('getTeam', function() {
    const cmdName = databasePopulation.commands.inviteteam.commandName;

    manager.userAllowedCommand(socket.id, cmdName, function(allowErr, allowed, user) {
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

  socket.on('inviteToTeam', function(data) {
    const cmdName = databasePopulation.commands.inviteteam.commandName;

    manager.userAllowedCommand(socket.id, cmdName, function(allowErr, allowed, user) {
      if (allowErr || !allowed || !data.user || !data.user.userName) {
        return;
      }

      getTeam(socket, user, function(err, team) {
        if (err) {
          return;
        } else if (team.owner !== user.userName && team.admins.indexOf(user.userName) === -1) {
          const errMsg = 'You are not an admin of the team. You are not allowed to add new team mebers';

          logger.sendSocketErrorMsg({
            socket: socket,
            code: logger.ErrorCodes.general,
            text: [errMsg],
            err: err,
          });

          return;
        }

        updateUserTeam(socket, data.userName, team.teamName);
      });
    });
  });

  socket.on('createTeam', function(data) {
    const cmdName = databasePopulation.commands.createteam.commandName;

    manager.userAllowedCommand(socket.id, cmdName, function(allowErr, allowed, user) {
      if (allowErr || !allowed || !data.team || !data.team.teamName) {
        return;
      }

      dbConnector.addTeam(data.team, function(err, team) {
        if (err || team === null) {
          logger.sendSocketErrorMsg({
            socket: socket,
            code: logger.ErrorCodes.general,
            text: ['Failed to create team'],
            err: err,
          });

          return;
        }

        updateUserTeam(socket, user.userName, data.team.teamName);
      });
    });
  });
}

exports.handle = handle;
