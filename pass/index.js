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

const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');
const spawnSync = require('child_process').spawnSync;
const stripJsonTrailingCommas = require('strip-json-trailing-commas').default;
const AdmZip = require('adm-zip');
const color = require('tinycolor2');
const nanoid = require('nanoid').nanoid;
const { barcodes, lproj, flatten } = require('./utils.js');
const config = require('../config.js');

/**
 * Class representing a pass. The type is intermediary, and can be converted
 *     between platforms.
 * @class
 */
class Pass {
  /**
   * Update some properties of the pass.
   * @instance
   */
  update() {
    Object.assign(...(arguments.length === 1 ? [this, arguments[0]] : arguments));
  }

  /**
   * Convert from a PKPass to a Pass
   * @param {Object} json PKPass JSON content
   * @instance
   * @abstract
   */
  fromPkPass(json) {}

  /**
   * Convert from a Google Wallet pass to a Pass
   * @param {Object} obj Google Wallet pass JSON
   * @param {string} cls Google Wallet class name
   * @instance
   * @abstract
   */
  fromGoogle(obj, cls) {}

  /**
   * Get the PKPass content fields
   * @returns {Object} JSON structure with the PKPass fields
   * @instance
   */
  get pkpassContentFields() {
    return this.constructor.pkpassContentFields;
  }

  /**
   * Get the pass type prefix (e.g. 'eventTicket' or 'loyalty')
   * @returns {string} The pass type prefix
   * @instance
   */
  get googlePrefix() {
    return this.constructor.googlePrefix;
  }

  set issuer(issuer) {
    this._issuer = issuer;
  }

  get issuer() {
    return this._issuer || config.defaultOrgName;
  }

  image(name) {
    return this.files[`${name}@2x.png`] || this.files[`${name}.png`];
  }

  /**
   * Get the default language to apply to passes (derived either from the pass
   *     itself or from config
   * @returns {string} The default language
   * @instance
   */
  get defaultLanguage() {
    if (this.strings && Object.keys(this.strings).length > 0 && !this.strings[config.defaultLanguage]) {
      return Object.keys(this.strings)[0];
    }
    return config.defaultLanguage;
  }

  /**
   * Convert a PKPass to a Pass
   * @param {Buffer} pkpassBuffer Binary string buffer of a PKPass archive
   * @returns {Pass} A converted Pass object
   * @static
   */
  static fromPkPass(pkpassBuffer) {
    // Read the archive from the string buffer
    const files = Object.fromEntries(
      new AdmZip(pkpassBuffer).getEntries().map(file => [file.entryName, file.getData()]),
    );

    // Parse the 'pass.json' file in the archive
    const json = JSON.parse(stripJsonTrailingCommas(files['pass.json'].toString('utf8').trim()));

    // Match the PKPass to the appropriate Google Wallet pass type
    const pass = createPassForType(cls => {
      const matches = json[cls.pkpassContentFields] !== undefined;
      return (
        matches &&
        (!cls.pkpassTransitTypes || cls.pkpassTransitTypes.indexOf(json[cls.pkpassContentFields].transitType) != -1)
      );
    });

    // Get the pass text content, grouped by language
    const strings = {};
    Object.keys(files).forEach(name => {
      if (name.indexOf(lproj.suffix) > -1) {
        const language = name.split(lproj.suffix)[0];
        strings[language] = lproj.parse(files[name].toString('utf8'));
      }
    });

    // Set the properties of the Pass object from the PKPass content
    pass.update({
      id: json.serialNumber,
      typeId: json.passTypeIdentifier,
      title: json.logoText,
      description: json.description,
      barcode: barcodes.fromPkPass(json.barcodes ? json.barcodes : json.barcode ? [json.barcode] : []),
      issuer: json.organizationName,
      backgroundColor: color(json.backgroundColor),
      files: files,
      strings: strings,
      frontContent: [
        json[pass.pkpassContentFields].headerFields,
        json[pass.pkpassContentFields].primaryFields,
        json[pass.pkpassContentFields].secondaryFields,
        json[pass.pkpassContentFields].auxiliaryFields,
      ].filter(fields => fields && fields.length > 0),
      backContent: json[pass.pkpassContentFields].backFields || [],
    });

    // Return the derived Pass object
    pass.logo = pass.image('icon');
    pass.fromPkPass(json);
    return pass;
  }

  /**
   * Convert a Google Wallet pass to a Pass
   * @param {Object} jwtPayload JWT JSON payload
   * @returns {Pass} A converted Pass object
   * @static
   */
  static fromGoogle(jwtPayload) {
    // Get the Google Wallet pass type
    const googlePrefix = Object.keys(jwtPayload)[0].replace(/Classes|Objects/, '');

    // Create a basic Pass object of the derived type
    const pass = createPassForType(cls => cls.googlePrefix === googlePrefix);

    // Get the Google Wallet pass object payload
    const json = jwtPayload[`${pass.googlePrefix}Objects`][0];

    let frontContent = [];
    let textModulesData = [];
    if (jwtPayload[`${googlePrefix}Objects`][0].textModulesData) {
      // Get the front content from the class template
      frontContent =
        jwtPayload[`${googlePrefix}Classes`][0].classTemplateInfo.cardTemplateOverride.cardRowTemplateInfos;

      // Get the text content from the pass
      textModulesData = jwtPayload[`${googlePrefix}Objects`][0].textModulesData;
    }

    const strings = {};

    /**
     * Get the text data from the
     *     [LocalizedString](https://developers.google.com/wallet/generic/rest/v1/LocalizedString)
     *     properties, grouped by language
     *
     * @todo addStrings should be a method on the pass object since these need
     *       to run in the subclass' fromGoogle method, for fields specific to
     *       the pass type
     * @param {Array} _strings
     * @returns The default value for the string content
     */
    function addStrings(_strings) {
      if (!_strings) {
        // No text data to parse
        return;
      }

      _strings.translatedValues ||= [];
      _strings.translatedValues.concat([_strings.defaultValue]).forEach(string => {
        strings[string.language] ||= {};
        strings[string.language][_strings.defaultValue.value] = string.value;
      });

      // Return the default value text
      return _strings.defaultValue.value;
    }

    // Get the TextModulesData as a map object { id: item }
    textModulesData = Object.fromEntries(textModulesData.map(item => [item.id, item]));

    // Get the front content as a map object { row: [item] }
    frontContent = frontContent.map(row => {
      const items = [];

      // Get any values for the specified row with the specified key
      ['item', 'startItem', 'middleItem', 'endItem'].forEach(key => {
        const item = Object.values(row)[0][key];

        if (item && item.firstValue.fields[0].fieldPath.indexOf('object.textModulesData') == 0) {
          // There is a TextModulesData object in the pass, get the key
          const key = item.firstValue.fields[0].fieldPath.split("'")[1];

          // Push this object to the list of items
          items.push({
            key: key,
            label: addStrings(textModulesData[key].localizedHeader) || textModulesData[key].header,
            value: addStrings(textModulesData[key].localizedBody) || textModulesData[key].body,
          });
        }
      });

      // Return the derived map of items
      return items;
    });

    // Get the back content (InfoModuleData) from the pass
    let backContent = jwtPayload[`${googlePrefix}Objects`][0].infoModuleData;

    // Check if there is any back content present
    backContent =
      !backContent || backContent.labelValueRows === undefined
        ? undefined
        : flatten(
            // Create a flattened map of back content { row: [item] }
            backContent.labelValueRows.map(row => {
              return row.columns.map(item => {
                const label = addStrings(item.localizedLabel) || item.label;
                return {
                  key: label,
                  label: label,
                  value: addStrings(item.localizedValue) || item.value,
                };
              });
            }),
          );

    const id = jwtPayload[`${googlePrefix}Objects`][0].id || nanoid();
    const classId = jwtPayload[`${googlePrefix}Objects`][0].classId || nanoid();

    // Set the properties of the Pass from the Google Wallet pass content
    pass.update({
      id: id ? id.replace(`${config.googleIssuerId}\.`, '') : undefined,
      typeId: classId ? classId.replace(`${config.googleIssuerId}\.`, '') : undefined,
      issuer: jwtPayload[`${googlePrefix}Classes`][0].issuerName,
      barcode: barcodes.fromGoogle(json.barcode),
      backgroundColor: color(json.hexBackgroundColor),
      frontContent: frontContent,
      backContent: backContent,
      strings: strings,
    });

    // Return the derived Pass object
    pass.fromGoogle(json, jwtPayload[`${pass.googlePrefix}Classes`][0]);
    return pass;
  }

  /**
   * Convert a Pass to a PKPass
   * @param {Function} imageHandler Handler for image saving and hosting
   * @returns {Buffer} Binary string buffer of the PKPass archive
   * @instance
   */
  async toPkPass(imageHandler) {
    // Create the new archive
    const zip = new AdmZip();

    // Creates a buffer for stringified JSON objects
    const jsonBuffer = obj => Buffer.from(JSON.stringify(obj, null, 2), 'utf8');

    // Create the 'pass.json' file and add it to the archive
    zip.addFile(
      'pass.json',
      jsonBuffer({
        passTypeIdentifier: config.pkPassPassTypeId,
        teamIdentifier: config.pkPassTeamId,
        serialNumber: this.id,
        webServiceURL: this.webServiceURL,
        authenticationToken: this.authenticationToken,
        formatVersion: 1,
        logoText: this.title,
        description: this.description || this.title,
        organizationName: this.issuer,
        foregroundColor: color(this.backgroundColor.isDark() ? 'white' : 'black').toRgbString(),
        backgroundColor: this.backgroundColor.toRgbString(),
        barcodes:
          this.barcode === undefined
            ? undefined
            : [
                {
                  message: this.barcode.message,
                  format: barcodes.formats[this.barcode.format].pkpass,
                },
              ],
        [this.pkpassContentFields]: this.content,
      }),
    );

    // Set the logo if none set
    this.logo ||= config.pkPassDefaultIconUrl;

    // Get the logo from the image host
    const logo = await imageHandler(this.logo);

    // Add the logo to the archive
    zip.addFile('icon@2x.png', logo);
    zip.addFile('logo@2x.png', logo);

    // Add the text content to the archive
    // Must be done in separate files for each language
    Object.keys(this.strings).forEach(language => {
      zip.addFile(language + lproj.suffix, Buffer.from(lproj.export(this.strings[language])));
    });

    // Create a manifest of files in the archive
    const tempDir = fs.mkdtempSync(os.tmpdir());
    const manifestPath = path.join(tempDir, 'manifest.json');
    const manifest = jsonBuffer(
      Object.fromEntries(
        zip.getEntries().map(file => [file.entryName, crypto.createHash('sha1').update(file.getData()).digest('hex')]),
      ),
    );

    // Add the manifest to the archive
    zip.addFile(path.basename(manifestPath), manifest);

    // If the required PKPass config is set, sign the archive
    // This creates a "real" PKPass that can be provided to users
    // Otherwise, signing has to be done by another service
    if (
      config.pkPassSigningCertPath &&
      config.pkPassSigningKeyPath &&
      config.pkPassWwdrCertPath &&
      config.pkPassPassTypeId &&
      config.pkPassTeamId
    ) {
      // Create the archive on the filesystem
      const signaturePath = path.join(tempDir, 'signature');
      fs.writeFileSync(manifestPath, manifest);

      // Use OpenSSL to sign the archive
      spawnSync('openssl', [
        'smime',
        '-sign',
        '-signer',
        config.pkPassSigningCertPath,
        '-inkey',
        config.pkPassSigningKeyPath,
        '-certfile',
        config.pkPassWwdrCertPath,
        '-in',
        manifestPath,
        '-out',
        signaturePath,
        '-outform',
        'DER',
        '-binary',
      ]);

      // Add the signature file to the archive
      zip.addFile(path.basename(signaturePath), fs.readFileSync(signaturePath));
    }

    // Return the archive as a buffer
    return zip.toBuffer();
  }

  /**
   * Convert a Pass to a Google Wallet pass
   * @param {Function} imageHandler Handler for image saving and hosting
   * @returns {Object} JSON representation of the pass classes and objects
   * @instance
   */
  async toGoogle(imageHandler) {
    // Set the image handler if not already
    // This handler does nothing
    imageHandler ||= async _ => undefined;

    // Converts a localized text field to a LocalizedString object
    const toLocalizedField = field => {
      if (!field.dateStyle && !field.timeStyle) {
        // This is not a date/time field
        // Return the LocalizedString object
        return this.toGoogleLocalizedField(field.value);
      }

      // Converts to a localized date/time field
      const toGoogleLocalizedDateTimeField = language => {
        return {
          language: language,
          value: this.fromPkPassDateTimeField(field, language),
        };
      };

      // Get the default value
      const defaultValue = toGoogleLocalizedDateTimeField(this.defaultLanguage);

      // Get the localized values
      const translatedValues = Object.keys(this.strings)
        .map(toGoogleLocalizedDateTimeField)
        .filter(field => field.value != defaultValue.value);

      // Return the LocalizedString object
      return {
        defaultValue: defaultValue,
        translatedValues: translatedValues.length > 0 ? translatedValues : undefined,
      };
    };

    // Gets the TextModulesData objects for the pass front content
    const textModulesData = flatten(this.frontContent).map(field => {
      return {
        id: field.key,
        localizedHeader: field.label ? this.toGoogleLocalizedField(field.label) : field.label,
        localizedBody: toLocalizedField(field),
      };
    });

    // Ensure each row in frontContent contains at most 3 items, if more then wrap into a new row.
    this.frontContent = flatten(
      this.frontContent.map(row => {
        const rows = [];
        while (row.length > 3) {
          rows.push(row.splice(0, 3));
        }
        if (row.length > 0) {
          rows.push(row);
        }
        return rows;
      }),
    );

    // Gets the CardRowTemplateInfo for the pass, ensuring at most 3 rows (the remaining will show in detail section)
    const cardRowTemplateInfos = this.frontContent.slice(0, 3).map(row => {
      // Converts a field to a TemplateItem
      const templateInfoJSON = field => ({
        firstValue: {
          fields: [
            {
              fieldPath: `object.textModulesData['${field.key}']`,
            },
          ],
        },
      });
      switch (row.length) {
        case 1:
          // Create a CardRowOneItem
          return {
            oneItem: {
              item: templateInfoJSON(row[0]),
            },
          };
        case 2:
          // Create a CardRowTwoItems
          return {
            twoItems: {
              startItem: templateInfoJSON(row[0]),
              endItem: templateInfoJSON(row[1]),
            },
          };
        case 3:
          // Create a CardRowThreeItems
          return {
            threeItems: {
              startItem: templateInfoJSON(row[0]),
              middleItem: templateInfoJSON(row[1]),
              endItem: templateInfoJSON(row[2]),
            },
          };
        default:
          throw 'Unreachable code, more than 3 items in a row';
      }
    });

    // Create the InfoModuleData from the Pass back content
    const infoModuleData =
      this.backContent.length === 0
        ? undefined
        : {
            labelValueRows: flatten(this.backContent).map(field => {
              return {
                columns: [
                  {
                    localizedLabel: this.toGoogleLocalizedField(field.label),
                    localizedValue: toLocalizedField(field),
                  },
                ],
              };
            }),
          };

    // Return the Google Wallet pass classes and objects
    return {
      [`${this.googlePrefix}Classes`]: [
        {
          id: `${config.googleIssuerId}.${this.typeId}`,
          reviewStatus: 'UNDER_REVIEW',
          issuerName: this.issuer,
          classTemplateInfo: {
            cardTemplateOverride: {
              cardRowTemplateInfos: cardRowTemplateInfos,
            },
          },
        },
      ],
      [`${this.googlePrefix}Objects`]: [
        {
          id: `${config.googleIssuerId}.${this.id}`,
          classId: `${config.googleIssuerId}.${this.typeId}`,
          barcode:
            this.barcode === undefined
              ? undefined
              : {
                  type: this.barcode.format,
                  value: this.barcode.message,
                },
          hexBackgroundColor: this.backgroundColor.toHexString(),
          textModulesData: textModulesData,
          infoModuleData: infoModuleData,
          state: 'ACTIVE',
        },
      ],
    };
  }

  /**
   * Get the default value from a LocalizedString
   * @param {Object} obj The LocalizedString object
   * @param {string} fieldName The field to extract
   * @returns {string} The field's default value
   * @instance
   */
  fromGoogleLocalizedField(obj, fieldName) {
    const localizedFieldName = 'localized' + fieldName[0].toUpperCase() + fieldName.substr(1);
    const field = obj[localizedFieldName] ? obj[localizedFieldName] : obj[fieldName];
    return field.defaultValue ? field.defaultValue.value : field;
  }

  /**
   * Creates a LocalizedString from a value
   * @param {string} value The string value to use
   * @returns {Object} A LocalizedString representation of the value
   * @instance
   */
  toGoogleLocalizedField(value) {
    // Get the string as a TranslatedString object
    const getString = (language, value) => {
      const field = {
        language: language,
        value: this.strings[language] && this.strings[language][value] ? this.strings[language][value] : value,
      };
      if (field.value === undefined || String(field.value).trim() === '') {
        // The field is an empty string
        // Return an empty value instead
        field.value = config.emptyValue;
      }

      // Return the TranslatedString object
      return field;
    };

    // Get the default TranslatedString object
    const defaultValue = getString(this.defaultLanguage, value);

    // Get the list of TranslatedString objects for each language in the Pass
    const translatedValues = Object.keys(this.strings)
      .map(language => getString(language, value))
      .filter(field => field.value != defaultValue.value);

    // Return the complete LocalizedString object
    return {
      defaultValue: defaultValue,
      translatedValues: translatedValues.length > 0 ? translatedValues : undefined,
    };
  }

  /**
   * Get the URI for an image from a Image object
   * @param {Object} field The Image object field
   * @returns {string} The image URI
   * @instance
   */
  fromGoogleImageField(field) {
    if (field !== undefined) {
      return field.sourceUri.uri;
    }
  }

  /**
   * Convert an image URI to an Image object
   * @param {string} uri The image URI
   * @returns {Object} The Image object representation
   * @instance
   */
  toGoogleImageField(uri) {
    if (uri !== undefined) {
      return { sourceUri: { uri } };
    }
  }

  /**
   * Set the various content fields for a PKPass object
   * @param {Object} content
   * @instance
   */
  setPkPassContentFields(content) {
    // Field names are defined by Apple
    ['primaryFields', 'secondaryFields', 'auxiliaryFields'].forEach(key => {
      content[key] ||= this.frontContent.shift();
    });

    // Set the front content from the Pass object for this key
    content.backFields ||= this.backContent;

    // Update the Pass object's content
    this.content = content;
  }

  /**
   * Convert a label and value to a PKPass content field
   * @param {string} label The content label
   * @param {Object} value The content value
   * @returns {Object} The PKPass content field
   * @instance
   */
  toPkPassContentField(label, value) {
    return {
      key: label,
      label: label,
      value: value,
    };
  }

  /**
   * Extract a date/time value from a localized PKPass date/time field
   * @param {Object} field The PKPass date/time field to extract
   * @param {string} language The language to select
   * @returns {string} The localized date/time value
   * @instance
   */
  fromPkPassDateTimeField(field, language) {
    // Parse the date from the field value
    const dateTime = new Date(Date.parse(field.value));

    // Date and time are localized separately
    const parts = [];
    if (field.dateStyle) {
      parts.push(dateTime.toLocaleDateString(language));
    }
    if (field.timeStyle) {
      parts.push(dateTime.toLocaleTimeString(language));
    }

    return parts.join(' ');
  }

  /**
   * Checks if a hint is present in the hint map (cached from hints.json) and
   *     returns the field
   * @param {string} hintName The field hint name
   * @returns {Object} The PKPass field
   * @instance
   */
  hintedPkPassField(hintName) {
    // Check if hintName is present in hints.json
    this._hints ||= config.hints;
    const pkpassFieldName = this._hints[hintName];

    // Initialize the hint cache if not already done
    this._hinted ||= {};
    if (this._hinted[pkpassFieldName]) {
      // The field already exists in the hint cache
      // Return the field
      return this._hinted[pkpassFieldName];
    }

    const matches = field => {
      if (field && field.key === pkpassFieldName) {
        // The field's key matches the PKPass field name
        // Add to the hint cache
        this._hinted[pkpassFieldName] = field;

        return false;
      }

      return true;
    };

    // Set front and back content based on the hint matches
    this.frontContent = this.frontContent.map(row => row.filter(matches)).filter(row => row.length > 0);
    this.backContent = this.backContent.filter(matches);

    // Return the hinted field
    return this._hinted[pkpassFieldName];
  }

  /**
   * Checks if a hint is present in the hint map and returns the value (or the
   *     default value if it is not present).
   * @param {string} name The field name
   * @param {string} defaultValue The default value to use
   * @returns {string} The PKPass field value
   * @instance
   */
  hintedPkPassFieldValue(name, defaultValue) {
    // Get the field from the hint cache
    const field = this.hintedPkPassField(name) || { value: '' };

    // Set the default value to an empty value if it is null
    defaultValue ||= config.emptyValue;

    // Return the field value if present, or the default value if not
    return field.value.trim().length > 0 ? field.value : defaultValue;
  }
}

/**
 * Create a skeleton Pass object based on the selected type
 * @param {Function} filter The filter function to apply
 * @returns {Pass} The skeleton Pass object
 */
function createPassForType(filter) {
  // Base array of available pass types
  const passClasses = [
    require('./types/generic.js'),
    require('./types/loyalty.js'),
    require('./types/event.js'),
    require('./types/offer.js'),
    require('./types/flight.js'),
    require('./types/transit.js'),
  ];

  // Filter the array and create an instance of the first filter result
  return new (passClasses.filter(filter)[0])();
}

module.exports = Pass;
