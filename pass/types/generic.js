/*
 * Copyright 2022 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const Pass = require('../');

/**
 * Represents a [Generic pass](https://developers.google.com/wallet/generic)
 * @class
 * @extends Pass
 */
class Generic extends Pass {
  // The Google Wallet pass type
  static googlePrefix = 'generic';

  // The PKPass type
  static pkpassContentFields = 'generic';

  /**
   * Create a Generic object from a Google Wallet pass
   * @param {Object} obj Google Wallet pass JSON
   * @param {string} cls Google Wallet class name
   * @override
   * @instance
   */
  fromGoogle(obj, cls) {
    this.update({
      title: this.fromGoogleLocalizedField(obj, 'cardTitle'),
      logo: this.fromGoogleImageField(obj.logo),
      description: this.fromGoogleLocalizedField(obj, 'header'),
    });
  }

  /**
   * Generate a PKPass from this Generic object
   * @param {Function} imageHandler Handler for image saving and hosting
   * @returns {Buffer} Binary string buffer of the PKPass archive
   * @override
   * @instance
   */
  async toPkPass(imageHandler) {
    this.setPkPassContentFields({});
    return super.toPkPass(imageHandler);
  }

  /**
   * Generate a Google Wallet pass/class from this Generic object
   * @param {Function} imageHandler Handler for image saving and hosting
   * @returns {Object} JSON representation of the pass classes and objects
   * @instance
   * @override
   */
  async toGoogle(imageHandler) {
    this.frontContent = this.frontContent.concat([this.backContent]).filter(row => row.length > 0);
    this.backContent = [];

    const pass = await super.toGoogle(imageHandler);

    this.update(pass.genericClasses[0], {
      issuerName: undefined,
      reviewStatus: undefined,
    });

    this.update(pass.genericObjects[0], {
      state: undefined,
      cardTitle: this.toGoogleLocalizedField(this.title),
      header: this.toGoogleLocalizedField(this.description),
      logo: this.toGoogleImageField(await imageHandler(this.logo)),
    });

    return pass;
  }
}

module.exports = Generic;
