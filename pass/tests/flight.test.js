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

const parseDate = require('chrono-node').parseDate;
const { loadPass, pkPassHasValue } = require('./utils.js');

const fieldTests = {
  date: (cls, _) => parseDate(cls.localScheduledDepartureDateTime).toLocaleDateString(),
  time: (cls, _) => parseDate(cls.localScheduledDepartureDateTime).toLocaleTimeString(),
  flightNumber: (cls, _) => cls.flightHeader.carrier.carrierIataCode + cls.flightHeader.flightNumber,
  origin: (cls, _) => cls.origin.airportIataCode,
  destination: (cls, _) => cls.destination.airportIataCode,
  passenger: (_, obj) => obj.passengerName,
  seatNumber: (_, obj) => obj.boardingAndSeatingInfo.seatNumber,
  gate: (cls, _) => cls.origin.gate,
};

for (const [field, getGoogleValue] of Object.entries(fieldTests)) {
  test(`a converted flight pkpass has the ${field} field value`, async () => {
    const { pkPass, pass } = await loadPass('flight.json');
    expect(pkPassHasValue(pkPass.boardingPass, pass[field])).toBe(true);
  });

  test(`a converted flight Google pass has the ${field} field value`, async () => {
    const { googlePass, pass } = await loadPass('flight.json');
    expect(getGoogleValue(googlePass.flightClasses[0], googlePass.flightObjects[0])).toBe(pass[field]);
  });
}
