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
const flatten = require('../utils.js').flatten;
const parseDate = require('chrono-node').parseDate;
const getAirlineName = require('airlines-iata-codes').getAirlineName;

/**
 * Represents a
 *     [Boarding pass](https://developers.google.com/wallet/tickets/boarding-passes)
 * @class
 * @extends Pass
 */
class Flight extends Pass {
  // The Google Wallet pass type
  static googlePrefix = 'flight';

  // The PKPass type
  static pkpassContentFields = 'boardingPass';

  // The PKPass transit type (PKPass groups air with other transit types)
  static pkpassTransitTypes = ['PKTransitTypeAir'];

  /**
   * Get the IATA or ICAO carrier code
   *
   * @return {string} - The carrier code
   * @instance
   */
  get carrierCode() {
    return this.flightNumber.slice(0, 2);
  }

  /**
   * Get the departure date/time
   *
   * @return {Date} - The departure date/time
   * @instance
   */
  get departureDateTime() {
    return parseDate(`${this.date} ${this.time}`);
  }

  /**
   * Create a Flight object from a PKPass
   * @param {Object} json The PKPass archive JSON
   * @override
   * @instance
   */
  fromPkPass(json) {
    this.update({
      passenger: this.hintedPkPassFieldValue('flight.passenger'),
      seatNumber: this.hintedPkPassFieldValue('flight.seatNumber'),
      seatClass: this.hintedPkPassFieldValue('flight.seatClass'),
      gate: this.hintedPkPassFieldValue('flight.gate'),
      origin: json.departureCode || this.hintedPkPassFieldValue('flight.originCode'),
      destination: json.arrivalCode || this.hintedPkPassFieldValue('flight.destinationCode'),
      flightNumber: this.hintedPkPassFieldValue('flight.flightNumber').replace(/\s/g, ''),
      date: this.hintedPkPassFieldValue('flight.date'),
      time: this.hintedPkPassFieldValue('flight.time'),
      confirmationCode: this.hintedPkPassFieldValue('flight.confirmationCode'),
    });

    if (this.departureDateTime === null) {
      throw 'Could not determine flight departure date/time, please specify via hints.json';
    }
  }

  /**
   * Create a Flight object from a Google Wallet pass
   * @param {Object} obj Google Wallet pass JSON
   * @param {string} cls Google Wallet class name
   * @override
   * @instance
   */
  fromGoogle(obj, cls) {
    const dateTime = parseDate(cls.localScheduledDepartureDateTime);
    const flightNumber = cls.flightHeader.carrier.carrierIataCode + cls.flightHeader.flightNumber;

    this.update({
      title: obj.passengerName,
      logo: this.fromGoogleImageField(cls.flightHeader.carrier.airlineLogo),
      description: flightNumber,
      passenger: obj.passengerName,
      seatNumber: obj.boardingAndSeatingInfo.seatNumber,
      seatClass: obj.boardingAndSeatingInfo.seatClass,
      confirmationCode: obj.reservationInfo.confirmationCode,
      gate: cls.origin.gate,
      origin: cls.origin.airportIataCode,
      destination: cls.destination.airportIataCode,
      flightNumber: flightNumber,
      date: dateTime.toLocaleDateString(),
      time: dateTime.toLocaleTimeString(),
    });
  }

  /**
   * Generate a PKPass from this Flight object
   * @param {Function} imageHandler Handler for image saving and hosting
   * @returns {Buffer} Binary string buffer of the PKPass archive
   * @override
   * @instance
   */
  async toPkPass(imageHandler) {
    this.setPkPassContentFields({
      headerFields: [
        this.toPkPassContentField('Date', this.date),
        this.toPkPassContentField('Flight', this.flightNumber),
      ],
      primaryFields: [
        this.toPkPassContentField('From', this.origin),
        this.toPkPassContentField('To', this.destination),
      ],
      secondaryFields: [
        this.toPkPassContentField('Passenger', this.passenger),
        this.toPkPassContentField('Seat', this.seatNumber),
      ],
      auxiliaryFields: [this.toPkPassContentField('Gate', this.gate), this.toPkPassContentField('Time', this.time)],
      backFields: flatten(this.frontContent).concat(this.backContent || []),
    });

    this.content.transitType = Flight.pkpassTransitTypes[0];
    this.issuer = getAirlineName(this.carrierCode);
    return super.toPkPass(imageHandler);
  }

  /**
   * Generate a Google Wallet pass/class from this Flight object
   * @param {Function} imageHandler Handler for image saving and hosting
   * @returns {Object} JSON representation of the pass classes and objects
   * @instance
   * @override
   */
  async toGoogle(imageHandler) {
    const pass = await super.toGoogle(imageHandler);

    this.update(pass.flightObjects[0], {
      passengerName: this.passenger,
      boardingAndSeatingInfo: {
        seatNumber: this.seatNumber,
        seatClass: this.seatClass,
      },
      reservationInfo: {
        confirmationCode: this.confirmationCode,
      },
    });

    this.update(pass.flightClasses[0], {
      origin: {
        gate: this.gate,
        airportIataCode: this.origin,
      },
      destination: {
        airportIataCode: this.destination,
      },
      flightHeader: {
        flightNumber: this.flightNumber.slice(2),
        carrier: {
          carrierIataCode: this.carrierCode,
          airlineLogo: this.toGoogleImageField(await imageHandler(this.image('icon'))),
        },
      },
      localScheduledDepartureDateTime: this.departureDateTime.toISOString().split('.')[0],
    });

    return pass;
  }
}

module.exports = Flight;
