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

const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');
const Pass = require('../');
const flatten = require('../utils.js').flatten;

function getPkPassJson(buffer) {
  const zip = new AdmZip(buffer);
  return JSON.parse(zip.getEntry('pass.json').getData().toString('utf8'));
}

async function googleToPkPass(name) {
  const googlePass = require(`./fixtures/${name}`);
  const pass = Pass.fromGoogle(googlePass);
  const pkPass = getPkPassJson(await pass.toPkPass(_ => undefined));
  return { pass, googlePass, pkPass };
}

async function pkPassToGoogle(name) {
  const f = fs.readFileSync(path.resolve(__dirname, `fixtures/${name}`));
  const pass = Pass.fromPkPass(f);
  const googlePass = await pass.toGoogle(_ => undefined);
  const pkPass = getPkPassJson(f);
  return { pass, googlePass, pkPass };
}

async function loadPass(name) {
  switch (path.extname(name)) {
    case '.json':
      return googleToPkPass(name);
    case '.pkpass':
      return pkPassToGoogle(name);
  }
}

function pkPassHasValue(contentFields, value) {
  return flatten(Object.values(contentFields)).filter(field => field && value && field.value === value).length > 0;
}

process.env.PASS_CONVERTER_CONFIG_PATH = path.resolve(__dirname, 'test-config.json');

module.exports = { loadPass, pkPassHasValue };
