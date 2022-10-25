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
 * Represents an [Offer]https://developers.google.com/wallet/retail/offers)
 * @class
 * @extends Pass
 */
class Offer extends Pass {
  // The Google Wallet pass type
  static googlePrefix = 'offer';

  // The PKPass type
  static pkpassContentFields = 'coupon';

  /**
   * Create an Offer object from a PKPass
   * @param {Object} json The PKPass archive JSON
   * @override
   * @instance
   */
  fromPkPass(json) {
    this.update({
      title: json.description || json.logoText,
      logo: this.image('icon'),
    });
  }

  /**
   * Create an Offer object from a Google Wallet pass
   * @param {Object} obj Google Wallet pass JSON
   * @param {string} cls Google Wallet class name
   * @override
   * @instance
   */
  fromGoogle(obj, cls) {
    this.update({
      title: this.fromGoogleLocalizedField(cls, 'title'),
      logo: this.fromGoogleImageField(cls.titleImage),
    });
  }

  /**
   * Generate a PKPass from this Offer object
   * @param {Function} imageHandler Handler for image saving and hosting
   * @returns {Buffer} Binary string buffer of the PKPass archive
   * @override
   * @instance
   */
  async toPkPass(imageHandler) {
    this.setPkPassContentFields({
      primaryFields: [
        {
          key: 'title',
          value: this.title,
        },
      ],
    });
    return super.toPkPass(imageHandler);
  }

  /**
   * Generate a Google Wallet pass/class from this Offer object
   * @param {Function} imageHandler Handler for image saving and hosting
   * @returns {Object} JSON representation of the pass classes and objects
   * @instance
   * @override
   */
  async toGoogle(imageHandler) {
    const pass = await super.toGoogle(imageHandler);

    this.update(pass.offerClasses[0], {
      redemptionChannel: 'BOTH',
      provider: this.issuer,
      localizedTitle: this.toGoogleLocalizedField(this.title),
      titleImage: this.toGoogleImageField(await imageHandler(this.logo)),
    });

    return pass;
  }
}

module.exports = Offer;
