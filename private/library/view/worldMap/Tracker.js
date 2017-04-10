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

class Tracker {
  startTracker() {
    this.watchId = navigator.geolocation.watchPosition((position) => {
      if (position) {
        this.isTracking = true;
        eventCentral.triggerEvent({
          event: eventCentral.Events.MYPOSITION,
          params: { position },
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

      setTimeout(() => {
        this.startTracker();
      }, 30000);
    }, 10000);
  }
}

module.exports = Tracker;
