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

class DeviceChecker {
  /**
   * @param {boolean} params.isStandalone - Is the Safari browser in standalone mode (opened through shortcut from Home screen in iOS)?
   * @param {string} params.userAgent - Browser user agent
   */
  constructor({ isStandalone, userAgent }) {
    this.isStandalone = isStandalone;
    this.DeviceEnum = {
      IOS: 1,
      ANDROID: 2,
      OTHER: 3,
    };
    this.deviceType = (() => {
      if (userAgent.match(/iP(hone|ad|od)/i) !== null) {
        return this.DeviceEnum.IOS;
      } else if (userAgent.match(/Android/i) !== null) {
        return this.DeviceEnum.ANDROID;
      }

      return this.DeviceEnum.OTHER;
    })();
    this.isTouchDevice = (() => (this.deviceType === this.DeviceEnum.IOS || this.deviceType === this.DeviceEnum.ANDROID))();
  }
}

module.exports = DeviceChecker;
