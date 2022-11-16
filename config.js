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

const stripJsonComments = require('strip-json-comments');
const stripJsonTrailingCommas = require('strip-json-trailing-commas').default;
const fs = require('fs');
const path = require('path');

// The Proxy wrapper ensures config is lazily loaded, so we can redefine
// PASS_CONVERTER_CONFIG_PATH at runtime, which we do in the tests.
module.exports = new Proxy(
  {},
  {
    get(target, prop, receiver) {
      if (this._config === undefined) {
        const configPath = process.env.PASS_CONVERTER_CONFIG_PATH || path.resolve(__dirname, 'config.json');
        this._config = JSON.parse(stripJsonTrailingCommas(stripJsonComments(fs.readFileSync(configPath, 'utf8'))));
        // Most of the entries default to empty strings, but code may expect them to be
        // undefined since they were originally env vars, so filter these out to retain the behavior.
        this._config = Object.fromEntries(Object.entries(this._config).filter(([key, value]) => value !== ''));
      }
      return this._config[prop];
    },
  },
);
