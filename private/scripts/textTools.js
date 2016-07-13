/** @module */

const labels = require('./labels');

/**
 * Characters used when generating random text
 * Removed l and i to decrease user errors when reading the random strings
 * @private
 * @type {string}
 */
const chars = 'abcdefghjkmnopqrstuvwxyz';
/**
 * Numbers used when generating random text
 * Removed 1 to decrease user errors when reading the random string
 * @private
 * @type {string}
 */
const numbers = '023456789';
/**
 * Special characters used when generating random text
 * @private
 * @type {string}
 */
const specials = '/\\!;:#&*';
/**
 * Used when generating random binary text
 * @private
 * @type {string}
 */
const binary = '01';
/**
 * Max string length
 * @private
 * @type {Number}
 */
const lineLength = 28;

/**
 * Beautifies number by adding a 0 before the number if it is lower than 10
 * @static
 * @param {Number} number - Number to be beautified
 * @returns {Number|string} - Single number or string with 0 + number
 */
function beautifyNumb(number) {
  return number > 9 ? number : `0${number}`;
}

/**
 * Takes date and returns shorter human-readable time
 * @static
 * @param {Date} date - Non-humanreadable date
 * @param {boolean} full - Should the month and day be added?
 * @param {boolean} year - Should year be added?
 * @returns {string} - Human-readable time and date
 */
function generateTimeStamp(date, full, year) {
  let newDate = new Date(date);
  let timeStamp;

  /**
   * Splitting of date is a fix for NaN on Android 2.*
   */
  if (isNaN(newDate.getMinutes())) {
    const splitDate = date.split(/[-T:\.]+/);
    newDate = new Date(Date.UTC(splitDate[0], splitDate[1], splitDate[2], splitDate[3], splitDate[4], splitDate[5]));
  }

  const mins = beautifyNumb(newDate.getMinutes());
  const hours = beautifyNumb(newDate.getHours());
  timeStamp = `${hours}:${mins}`;

  if (full) {
    const month = beautifyNumb(newDate.getMonth());
    const day = beautifyNumb(newDate.getDate());
    timeStamp = `${day}/${month} ${timeStamp}`;
  }

  if (year) {
    const fullYear = newDate.getFullYear();
    timeStamp = `${fullYear} ${timeStamp}`;
  }

  return timeStamp;
}

/**
 * Does the string contain only legal (a-zA-z0-9) alphanumerics?
 * @static
 * @param {string} text - String to be checked
 * @returns {boolean} - Does string contain only legal (a-zA-z0-9) alphanumerics?
 */
function isTextAllowed(text) {
  return /^[a-zA-Z0-9]+$/g.test(text);
}

/**
 * Replaces part of the sent string and returns it
 * @static
 * @param {string} text - Original string
 * @param {string} find - Substring to replace
 * @param {string} replaceWith - String that will replace the found substring
 * @returns {string} - Modified string
 */
function findOneReplace(text, find, replaceWith) {
  return text.replace(new RegExp(find), replaceWith);
}

/**
 * Trims whitespaces from beginning and end of the string
 * Needed for Android 2.1. trim() is not supported
 * @static
 * @param {string} sentText - String to be trimmed
 * @returns {string} - String with no whitespaces in the beginning and end
 */
function trimSpace(sentText) {
  return findOneReplace(sentText, /^\s+|\s+$/, '');
}

/**
 * Creates and returns a randomised string
 * @static
 * @param {Object} params - Parameters
 * @param {string} params.selection - Characters to randomise from
 * @param {Number} params.length - Length of randomised string
 * @param {boolean} params.upperCase - Should all characters be in upper case?
 * @param {boolean} params.codeMode - Should there be extra {} and () inserted into the string?
 * @returns {string} - Randomised string
 */
function createRandString(params) {
  const selection = params.selection;
  const length = params.length;
  const upperCase = params.upperCase;
  const codeMode = params.codeMode;
  const randomLength = selection.length;
  let result = '';

  for (let i = 0; i < length; i++) {
    const randomVal = Math.round(Math.random() * (randomLength - 1));
    let val = Math.random() > 0.5 ? selection[randomVal].toUpperCase() : selection[randomVal];

    if (codeMode) {
      const rand = Math.random();

      // If new value is a character or number
      if (i < length - 2 && (chars + numbers).indexOf(val) > -1) {
        if (rand > 0.95) {
          val = `${val}{}`;
          i += 2;
        } else if (rand < 0.05) {
          val = `${val}()`;
          i += 2;
        }
      }
    }

    result += val;
  }

  if (upperCase) {
    return result.toUpperCase();
  }

  return result;
}

/**
 * Creates ands returns a randomised alphanumeric string of 15 characters
 * Used to create device IDs
 * @static
 * @returns {string} - 15 characters alphanumeric
 */
function createDeviceId() {
  return createRandString({
    selection: numbers + chars,
    length: 15,
    upperCase: false,
  });
}

/**
 * Creates and returns a randomised string
 * @static
 * @param {Number} length - Length of randomised string
 * @param {boolean} upperCase - Should all characters be in upper case?
 * @returns {string} - Randomised string
 */
function createCharString(length, upperCase) {
  return createRandString({
    selection: chars,
    length,
    upperCase,
  });
}

/**
 * Creates and returns a randomised string, only containing 0 and 1
 * @static
 * @param {Number} length - Length of randomised string
 * @returns {string} - Randomised string
 */
function createBinaryString(length) {
  return createRandString({
    selection: binary,
    length,
  });
}

/**
 * Creates and returns a randomised string, containing alphanumeric and special characters
 * @static
 * @param {Number} length - Length of randomised string
 * @param {boolean} upperCase - Should all characters be in upper case?
 * @param {boolean} codeMode - Should there be extra {} and () inserted into the string?
 * @returns {string} - Randomised string
 */
function createMixedString(length, upperCase, codeMode) {
  return createRandString({
    selection: numbers + chars + specials,
    length,
    upperCase,
    codeMode,
  });
}

/**
 * Creates and returns a string containing one to many -
 * @static
 * @param {Number} length - Length of string
 * @returns {string} - String containing -
 */
function createLine(length) {
  let line = '';

  for (let i = 0; i < length; i++) {
    line += '-';
  }

  return line;
}

/**
 * Creates and returns a string containing - times lineLength
 * @static
 * @returns {string} - String containing -
 */
function createFullLine() {
  return createLine(lineLength);
}

/**
 * Creates two lines with the command name in the middle
 * @static
 * @param {string} commandName - Name of the command
 * @returns {string[]} - Array with two lines and the command name in the middle
 */
function createCommandStart(commandName) {
  return [
    createFullLine(),
    ` ${commandName.toUpperCase()}`,
    createFullLine(),
  ];
}

/**
 * Creates visual command end
 * @static
 * @returns {string} - String containing multiple -
 */
function createCommandEnd() {
  return createFullLine();
}

/**
 * Creates broadcast specific command start look
 * @static
 * @param {Object} params - Parameters
 * @param {string} params.sender - Name of the sender of the message
 * @returns {string[]} - Two lines with text inbetween
 */
function prependBroadcastMessage(params = {}) {
  const title = {};

  if (params.sender) {
    title.text = `${labels.getString('broadcast', 'broadcastFrom')} ${params.sender}`;
  } else {
    title.text = labels.getString('broadcast', 'broadcast');
  }

  return createCommandStart(title.text);
}

/**
 * Checks if the message has a specific extraClass set, modifies the message object and returns it
 * @static
 * @param {Object} message - Message object to be modified
 * @returns {Object} - Sent message object with added text
 */
function addMessageSpecialProperties(message = {}) {
  const modifiedMessage = message;

  /**
   * Prepends the text in the message with the broadcast look
   */
  if (message.extraClass === 'broadcastMsg') {
    modifiedMessage.text = prependBroadcastMessage({ sender: message.customSender }).concat(message.text);
    modifiedMessage.text.push(createFullLine());
  }

  return modifiedMessage;
}

/**
 * Creates array with randomised strings.
 * It will also insert substrings into the randomised strings, if requiredStrings is set
 * @static
 * @param {Object} params - Parameters
 * @param {Number} params.amount - Number of randomised strings
 * @param {Number} params.length - Length of randomised string
 * @param {boolean} params.upperCase - Should all characters be in upper case?
 * @param {boolean} params.codeMode - Should there be extra {} and () inserted into the string?
 * @param {string[]} params.requiredStrings - Substrings to be added into the randomised strings
 * @returns {string[]} - Randomised strings
 */
function createMixedArray(params) {
  const amount = params.amount;
  const length = params.length;
  const upperCase = params.upperCase;
  const codeMode = params.codeMode;
  const requiredStrings = params.requiredStrings || [];
  const text = [];
  const requiredIndexes = [];

  for (let i = 0; i < amount; i++) {
    text.push(createMixedString(length, upperCase, codeMode));
  }

  for (let i = 0; i < requiredStrings.length; i++) {
    const stringLength = requiredStrings[i].length;
    const randomStringIndex = Math.floor(Math.random() * (length - stringLength - 1));
    let randomArrayIndex = Math.floor(Math.random() * (amount - 2));

    /**
     * Max 1 required string per randomised string
     * Stores the indexes of the ones who already had a substring added to them
     * This rule will be ignored and multiple substrings can appear in a randomised string if the amount of required string is higher than the amount of strings to be generated
     */
    while (requiredIndexes.length < amount && requiredIndexes.indexOf(randomArrayIndex) > - 1) {
      randomArrayIndex = Math.floor(Math.random() * (amount - 2));
    }

    /**
     * Inserts required string and cuts away enough characters from the left and right of the random string to keep the length intact
     */
    text[randomArrayIndex] = text[randomArrayIndex].slice(0, randomStringIndex) + requiredStrings[i] + text[randomArrayIndex].slice(randomStringIndex + stringLength);
    requiredIndexes.push(randomArrayIndex);
  }

  return text;
}

exports.createDeviceId = createDeviceId;
exports.createCharString = createCharString;
exports.createBinaryString = createBinaryString;
exports.createLine = createLine;
exports.createFullLine = createFullLine;
exports.createMixedString = createMixedString;
exports.createRandString = createRandString;
exports.isTextAllowed = isTextAllowed;
exports.createCommandStart = createCommandStart;
exports.createCommandEnd = createCommandEnd;
exports.trimSpace = trimSpace;
exports.prependBroadcastMessage = prependBroadcastMessage;
exports.addMessageSpecialProperties = addMessageSpecialProperties;
exports.generateTimeStamp = generateTimeStamp;
exports.beautifyNumb = beautifyNumb;
exports.createMixedArray = createMixedArray;
