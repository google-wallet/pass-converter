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
const parseDate = require('chrono-node').parseDate;

/**
 * Enum for transit types
 * @readonly
 * @enum {Object}
 */
const TRANSIT_TYPES = {
  RAIL: { pkpass: 'PKTransitTypeTrain' },
  FERRY: { pkpass: 'PKTransitTypeBoat' },
  BUS: { pkpass: 'PKTransitTypeBus' },
  TRAM: { pkpass: 'PKTransitTypeGeneric' },
  OTHER: { pkpass: 'PKTransitTypeGeneric' },
};

/**
 * Enum for PKPass transit types
 * @readonly
 * @enum {Object}
 */
const APPLE_TRANSIT_TYPES = {
  PKTransitTypeTrain: 'RAIL',
  PKTransitTypeBoat: 'FERRY',
  PKTransitTypeBus: 'BUS',
  PKTransitTypeGeneric: 'OTHER',
};

/**
 * Represents a
 *     [Transit pass](https://developers.google.com/wallet/tickets/transit-passes/qr-code/overview)
 * @class
 * @extends Pass
 */
class Transit extends Pass {
  // The Google Wallet pass type
  static googlePrefix = 'transit';

  // The PKPass type
  static pkpassContentFields = 'boardingPass';
  static pkpassTransitTypes = Object.keys(APPLE_TRANSIT_TYPES);

  /**
   * Create a Transit object from a PKPass
   * @param {Object} json The PKPass archive JSON
   * @override
   * @instance
   */
  fromPkPass(json) {
    this.update({
      transitType: APPLE_TRANSIT_TYPES[json[this.pkpassContentFields].transitType],
      originName: this.hintedPkPassFieldValue('transit.originName'),
      originDate: this.hintedPkPassFieldValue('transit.originDate'),
      originTime: this.hintedPkPassFieldValue('transit.originTime'),
      destinationName: this.hintedPkPassFieldValue('transit.destinationName'),
      destinationDate: this.hintedPkPassFieldValue('transit.destinationDate'),
      destinationTime: this.hintedPkPassFieldValue('transit.destinationTime'),
    });
  }

  /**
   * Create a Transit object from a Google Wallet pass
   * @param {Object} obj Google Wallet pass JSON
   * @param {string} cls Google Wallet class name
   * @override
   * @instance
   */
  fromGoogle(obj, cls) {
    const originDateTime = parseDate(obj.ticketLeg.departureDateTime);
    const destinationDateTime = parseDate(obj.ticketLeg.arrivalDateTime);
    const originName = obj.ticketLeg.originName
      ? this.fromGoogleLocalizedField(obj.ticketLeg, 'originName')
      : obj.ticketLeg.originStationCode;
    const destinationName = obj.ticketLeg.destinationName
      ? this.fromGoogleLocalizedField(obj.ticketLeg, 'destinationName')
      : obj.ticketLeg.destinationStationCode;

    this.update({
      title: `${originName} - ${destinationName}`,
      logo: this.fromGoogleImageField(cls.logo),
      transitType: cls.transitType,
      originName: originName,
      originDate: originDateTime.toLocaleDateString(),
      originTime: originDateTime.toLocaleTimeString(),
      destinationName: destinationName,
      destinationDate: destinationDateTime.toLocaleDateString(),
      destinationTime: destinationDateTime.toLocaleTimeString(),
    });
  }

  /**
   * Generate a PKPass from this Transit object
   * @param {Function} imageHandler Handler for image saving and hosting
   * @returns {Buffer} Binary string buffer of the PKPass archive
   * @override
   * @instance
   */
  async toPkPass(imageHandler) {
    this.setPkPassContentFields({
      primaryFields: [
        this.toPkPassContentField('Origin', this.originName),
        this.toPkPassContentField('Destination', this.destinationName),
      ],
      secondaryFields: [
        this.toPkPassContentField('Departing', `${this.originDate} ${this.originTime}`),
        this.toPkPassContentField('Arriving', `${this.destinationDate} ${this.destinationTime}`),
      ],
    });

    this.content.transitType = TRANSIT_TYPES[this.transitType.toUpperCase()].pkpass;
    return super.toPkPass(imageHandler);
  }

  /**
   * Generate a Google Wallet pass/class from this Transit object
   * @param {Function} imageHandler Handler for image saving and hosting
   * @returns {Object} JSON representation of the pass classes and objects
   * @instance
   * @override
   */
  async toGoogle(imageHandler) {
    const pass = await super.toGoogle(imageHandler);

    this.update(pass.transitClasses[0], {
      transitType: this.transitType,
      logo: this.toGoogleImageField(await imageHandler(this.logo)),
    });

    this.update(pass.transitObjects[0], {
      tripType: 'ONE_WAY',
      ticketLeg: {
        originName: this.toGoogleLocalizedField(this.originName),
        destinationName: this.toGoogleLocalizedField(this.destinationName),
        departureDateTime: parseDate(`${this.originDate} ${this.originTime}`).toISOString(),
        arrivalDateTime: parseDate(`${this.destinationDate} ${this.destinationTime}`).toISOString(),
      },
    });

    return pass;
  }
}

module.exports = Transit;
