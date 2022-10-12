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

const color = require('tinycolor2');
const { loadPass, pkPassHasValue } = require('./utils.js');

const passTypes = ['event', 'flight', 'generic', 'loyalty', 'offer', 'transit'];

for (const passType of passTypes) {
  test(`a converted ${passType} pkpass has a description field`, async () => {
    const { pkPass, pass } = await loadPass(`${passType}.json`);
    expect(pkPass.description === undefined).toBe(false);
  });
}

test('a converted pkpass has a backgroundColor field', async () => {
  const { pkPass, pass } = await loadPass('generic.json');
  expect(color.equals(pkPass.backgroundColor, pass.backgroundColor)).toBe(true);
  expect(color(pkPass.backgroundColor).getFormat()).toBe('rgb');
});

test('a converted pkpass has a barcode', async () => {
  const { pkPass, pass } = await loadPass('generic.json');
  expect(pkPass.barcodes[0].message).toBe(pass.barcode.message);
});

test('a converted Google pass has a hexBackgroundColor field', async () => {
  const { googlePass, pass } = await loadPass('generic.pkpass');
  expect(color.equals(googlePass.genericObjects[0].hexBackgroundColor, pass.backgroundColor)).toBe(true);
  expect(color(googlePass.genericObjects[0].hexBackgroundColor).getFormat()).toBe('hex');
});

test('a converted Google pass has a barcode', async () => {
  const { googlePass, pass } = await loadPass('generic.pkpass');
  expect(googlePass.genericObjects[0].barcode.value).toBe(pass.barcode.message);
});
