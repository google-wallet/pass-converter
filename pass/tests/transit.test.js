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

const { loadPass, pkPassHasValue } = require('./utils.js');

const fieldTests = {
  'an origin name': pass => pass.originName,
  'an origin date/time': pass => `${pass.originDate} ${pass.originTime}`,
  'a destination name': pass => pass.destinationName,
  'a destination date/time': pass => `${pass.destinationDate} ${pass.destinationTime}`,
};

for (const [fieldName, getField] of Object.entries(fieldTests)) {
  test(`a converted transit pkpass has ${fieldName}`, async () => {
    const { pkPass, pass } = await loadPass('transit.json');
    expect(pkPassHasValue(pkPass.boardingPass, getField(pass))).toBe(true);
  });
}

test(`a converted transit pkpass has a transit type`, async () => {
  const { pkPass, pass } = await loadPass('transit.pkpass');
  expect(pkPass.boardingPass.transitType).toBe('PKTransitTypeGeneric');
});
