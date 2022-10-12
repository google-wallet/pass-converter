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

test('a converted offer pkpass has a title field', async () => {
  const { pkPass, pass } = await loadPass('offer.json');
  expect(pkPassHasValue(pkPass.coupon, pass.title)).toBe(true);
});

test('a converted offer Google pass has a title field', async () => {
  const { googlePass, pass } = await loadPass('offer.pkpass');
  expect(googlePass.offerClasses[0].localizedTitle.defaultValue.value).toBe(pass.title);
});
