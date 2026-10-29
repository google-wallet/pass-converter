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
const Pass = require('../index.js');
const { google } = require('googleapis');

jest.mock('googleapis');

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

test('a converted transit pass from a reference-only (skinny) JWT', async () => {
  const mockPassObject = {
    id: '12345.object',
    classId: '12345.class',
    hexBackgroundColor: '#ffffff',
    barcode: { type: 'QR_CODE', value: 'test' },
  };
  const mockPassClass = {
    id: '12345.class',
    issuerName: 'Test Issuer',
  };

  google.auth.GoogleAuth.prototype.getClient = jest.fn().mockResolvedValue({});
  google.walletobjects.mockReturnValue({
    transitobject: {
      get: jest.fn().mockResolvedValue({ data: mockPassObject }),
    },
    transitclass: {
      get: jest.fn().mockResolvedValue({ data: mockPassClass }),
    },
  });

  const skinnyJwt = {
    transitObjects: [
      {
        classId: '12345.class',
        id: '12345.object',
      },
    ],
  };

  const pass = await Pass.fromGoogle(skinnyJwt);
  expect(pass.id).toBe('object');
  expect(pass.issuer).toBe('Test Issuer');
});
