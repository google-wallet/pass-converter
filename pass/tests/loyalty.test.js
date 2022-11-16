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
  primaryBalance: (pass, obj) => pass.fromGoogleBalanceField(obj.loyaltyPoints).value,
  secondaryBalance: (pass, obj) => pass.fromGoogleBalanceField(obj.secondaryLoyaltyPoints).value,
};

for (const [field, getGoogleValue] of Object.entries(fieldTests)) {
  test(`a converted loyalty pkpass has the ${field} field value`, async () => {
    const { pkPass, pass } = await loadPass('loyalty.json');
    expect(pkPassHasValue(pkPass.storeCard, pass[field].value)).toBe(true);
  });

  test(`a converted loyalty Google pass has the ${field} field value`, async () => {
    const { googlePass, pass } = await loadPass('loyalty.pkpass');
    expect(getGoogleValue(pass, googlePass.loyaltyObjects[0])).toBe(pass[field].value);
  });
}
