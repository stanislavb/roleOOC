'use strict';

const dbDefaults = require('./dbPopDefaults');

/*
 * All app specific configuration
 */

const config = {};

config.gameLocation = {
  country: 'Sweden',
  lat: '59.751429',
  lon: '15.198645',
};
config.historyLines = 80;
config.chunkLength = 10;
config.userVerify = false;
config.title = 'Organica Oracle v4.0';
config.defaultMode = dbDefaults.modes.command;

module.exports = config;
