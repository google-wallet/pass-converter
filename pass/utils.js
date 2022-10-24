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

const stripComments = require('strip-comments');

/**
 * Flattens the array by concatenating nested arrays (e.g. [1, [2, 2, 2], 3, 4]
 *     would be flattened to [1, 2, 2, 2, 3, 4])
 * @param {Array} array - The array of values to flatten
 * @returns {Array} A flattened array
 */
function flatten(array) {
  return [].concat.apply([], array);
}

/**
 * Maps PKPass barcode types to Google Wallet barcode types
 * @class
 */
class Barcodes {
  formats = {
    AZTEC: {
      pkpass: 'PKBarcodeFormatAztec',
      googleLegacy: ['aztec'],
    },
    CODE_128: {
      pkpass: 'PKBarcodeFormatCode128',
      googleLegacy: ['code128'],
    },
    PDF_417: {
      pkpass: 'PKBarcodeFormatPDF417',
      googleLegacy: ['pdf417', 'PDF417'],
    },
    QR_CODE: {
      pkpass: 'PKBarcodeFormatQR',
      googleLegacy: ['qrCode'],
    },
  };

  /**
   * Gets a barcode message and supported types from a list of PKPass barcodes
   *
   * @param {Array} barcodes - The list of PKPass barcodes
   * @returns {Object} The barcode message and the matching Google Wallet barcode types
   */
  fromPkPass(barcodes) {
    let matched = undefined;

    // Map PKPass format to Google Wallet format
    const pkPassFormats = Object.fromEntries(Object.entries(this.formats).map(e => [e[1].pkpass, e[0]]));

    // Check each barcode for a match and add to to matched.format
    barcodes.forEach(barcode => {
      matched = {
        message: barcode.message,
        format: pkPassFormats[barcode.format],
      };
    });

    // Return the barcode message and matched types
    return matched;
  }

  /**
   * Gets a barcode message and supported types from a Google Wallet barcode
   * @param {Object} barcode - The Google Wallet barcode
   * @returns {Object} The barcode message and the matching Google Wallet barcode types
   */
  fromGoogle(barcode) {
    // Map legacy format names to updated format names
    const legacyFormats = Object.fromEntries(
      flatten(
        Object.entries(this.formats).map(e => {
          return e[1].googleLegacy.map(legacy => [legacy, e[0]]);
        }),
      ),
    );

    // Check if the barcode exists and the type is supported
    if (barcode && (this.formats[barcode.type] || legacyFormats[barcode.type])) {
      return {
        format: legacyFormats[barcode.type] || barcode.type,
        message: barcode.value,
      };
    }
  }
}

/**
 * Text parsing utility
 *
 * @todo Use an actual parser
 * @class
 */
class Lproj {
  suffix = '.lproj/pass.strings';

  parse(s) {
    const parts = stripComments(s)
      .split('";')
      .map(line => {
        return line
          .slice(line.indexOf('"') + 1)
          .replace(/\n/, '')
          .split('" = "');
      })
      .filter(line => line.length > 1);
    return Object.fromEntries(parts);
  }

  export(obj) {
    return JSON.stringify(obj).replace(/":"/g, '" = "').replace(/",/g, '";\n').slice(1, -1) + ';';
  }
}

const barcodes = new Barcodes();
const lproj = new Lproj();

module.exports = { barcodes, lproj, flatten };
