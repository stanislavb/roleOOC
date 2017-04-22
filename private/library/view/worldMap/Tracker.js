/*
 Copyright 2016 Aleksandar Jankovic

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

const eventCentral = require('../../EventCentral');
const socketManager = require('../../SocketManager');
const storageManager = require('../../StorageManager');

/**
 * Convert from geolocation position
 * @param {Object} position Geolocation position
 * @returns {Object} Converted position
 */
function convertPosition(position) {
  return {
    coordinates: {
      longitude: position.coords.longitude,
      latitude: position.coords.latitude,
      speed: position.coords.speed,
      heading: position.coords.heading,
      accuracy: position.coords.accuracy,
    },
    lastUpdated: new Date(),
  };
}

class Tracker {
  constructor() {
    this.latestPositions = [];
  }

  startTracker() {
    eventCentral.addWatcher({
      watcherParent: this,
      event: eventCentral.Events.MYPOSITION,
      func: ({ position }) => {
        this.latestPositions.push(position);
      },
    });

    this.watchId = navigator.geolocation.watchPosition((position) => {
      if (position) {
        this.isTracking = true;
        eventCentral.triggerEvent({
          event: eventCentral.Events.MYPOSITION,
          params: { position: convertPosition(position) },
        });
      } else {
        this.isTracking = false;
      }
    }, (err) => {
      this.isTracking = false;
      console.log(err);
    }, { enableHighAccuracy: true });

    setTimeout(() => {
      navigator.geolocation.clearWatch(this.watchId);
      this.sendBestPosition();

      setTimeout(() => {
        this.latestPositions = [];
        this.startTracker();
      }, 15000);
    }, 15000);
  }

  getBestPosition() {
    const positions = Array.from(this.latestPositions);

    let bestPosition = null;

    if (positions.length > 0) {
      while (positions.length > 0) {
        const position = positions.pop();

        if (position.coordinates && (!bestPosition || position.coordinates.accuracy < bestPosition.coordinates.accuracy)) {
          bestPosition = position;
        }
      }
    }

    return bestPosition;
  }

  sendBestPosition() {
    if (!storageManager.getUserName()) {
      return;
    }

    const position = this.getBestPosition();

    if (!position || !position.coordinates || !position.coordinates.latitude || !position.coordinates.longitude || !position.coordinates.accuracy) {
      console.log('Requires position: { coordinates: { latitude, longitude, accuracy }} to send user position');

      return;
    }

    socketManager.emitEvent('updateUserPosition', { position }, (err) => {
      if (err) {
        console.log(err);
      }
    });
  }
}

module.exports = Tracker;
