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

const Pass = require('../');

/**
 * Represents a
 *     [Loyalty card]https://developers.google.com/wallet/retail/loyalty-cards)
 * @class
 * @extends Pass
 */
class Loyalty extends Pass {
  // The Google Wallet pass type
  static googlePrefix = 'loyalty';

  // The PKPass type
  static pkpassContentFields = 'storeCard';

  /**
   * Create a Loyalty object from a PKPass
   * @param {Object} json The PKPass archive JSON
   * @override
   * @instance
   */
  fromPkPass(json) {
    this.update({
      primaryBalance: this.hintedPkPassField('loyalty.primaryBalance'),
      secondaryBalance: this.hintedPkPassField('loyalty.secondaryBalance'),
      logo: this.image('icon'),
    });
  }

  /**
   * Create a Loyalty object from a Google Wallet pass
   * @param {Object} obj Google Wallet pass JSON
   * @param {string} cls Google Wallet class name
   * @override
   * @instance
   */
  fromGoogle(obj, cls) {
    this.update({
      title: cls.programName,
      logo: this.fromGoogleImageField(cls.programLogo),
      primaryBalance: this.fromGoogleBalanceField(obj.loyaltyPoints),
      secondaryBalance: this.fromGoogleBalanceField(obj.secondaryLoyaltyPoints),
    });
  }

  /**
   * Generate a PKPass from this Loyalty object
   * @param {Function} imageHandler Handler for image saving and hosting
   * @returns {Buffer} Binary string buffer of the PKPass archive
   * @override
   * @instance
   */
  async toPkPass(imageHandler) {
    this.setPkPassContentFields({
      headerFields: this.primaryBalance ? [this.primaryBalance] : undefined,
      primaryFields: this.secondaryBalance ? [this.secondaryBalance] : undefined,
    });

    return super.toPkPass(imageHandler);
  }

  /**
   * Generate a Google Wallet pass/class from this Loyalty object
   * @param {Function} imageHandler Handler for image saving and hosting
   * @returns {Object} JSON representation of the pass classes and objects
   * @instance
   * @override
   */
  async toGoogle(imageHandler) {
    const pass = await super.toGoogle(imageHandler);

    this.update(pass.loyaltyClasses[0], {
      programName: this.issuer,
      programLogo: this.toGoogleImageField(await imageHandler(this.logo)),
    });

    this.update(pass.loyaltyObjects[0], {
      loyaltyPoints: this.toGoogleBalanceField(this.primaryBalance),
      secondaryLoyaltyPoints: this.toGoogleBalanceField(this.secondaryBalance),
    });

    return pass;
  }

  /**
   * Extract the balance from the LoyaltyPointsBalance property
   * @param {Object} field The field to extract from
   * @returns {Object} The extracted balance
   * @instance
   */
  fromGoogleBalanceField(field) {
    if (field !== undefined) {
      return {
        label: this.fromGoogleLocalizedField(field, 'label'),
        currencyCode: field.balance.money ? field.balance.money.currencyCode : undefined,
        value:
          field.balance.string ||
          field.balance.int ||
          field.balance.double ||
          (field.balance.money.micros / Math.pow(10, precision(field.balance.money.currencyCode))).toFixed(
            precision(field.balance.money.currencyCode),
          ),
      };
    }
  }

  /**
   * Convert the balance to a LoyaltyPointsBalance property
   * @param {Object} field The field to extract from
   * @returns {Object} The LoyaltyPointsBalance property
   * @instance
   */
  toGoogleBalanceField(field) {
    if (field === undefined) {
      // Field is not present, return nothing
      return;
    }

    let valueField;
    let value = field.value;

    if (!field.currencyCode) {
      // No currency code is present
      // The value is either 'double', 'int', or 'string'
      if (String(Number(value)) === String(value)) {
        // Set the valueField to 'double' if a decimal is present
        // Otherwise, set it to 'int'
        valueField = String(value).indexOf('.') > 0 ? 'double' : 'int';
        value = Number(value);
      } else {
        // The value is a string
        valueField = 'string';
      }
    } else {
      // Currency code is present
      // The value is a Money field
      valueField = 'money';
      value = {
        currencyCode: field.currencyCode,
        micros: Math.round(value * Math.pow(10, precision(field.currencyCode))),
      };
    }

    // Return the localized LoyaltyPointsBalance
    return {
      localizedLabel: field.label ? this.toGoogleLocalizedField(field.label) : undefined,
      balance: { [valueField]: value },
    };
  }
}

/**
 * Get the decimal precision based on the currency code
 * @param {string} currencyCode The currency code (3-letter string)
 * @returns {int} The decimal precision
 */
function precision(currencyCode) {
  return {
    AED: 2,
    AFN: 2,
    AMD: 2,
    ANG: 2,
    AOA: 2,
    ARS: 2,
    AUD: 2,
    AWG: 2,
    AZN: 2,
    BAM: 2,
    BBD: 2,
    BDT: 2,
    BGN: 2,
    BHD: 3,
    BIF: 0,
    BMD: 2,
    BND: 2,
    BOB: 2,
    BRL: 2,
    BSD: 2,
    BWP: 2,
    BYR: 0,
    BYN: 2,
    BZD: 2,
    CAD: 2,
    CDF: 2,
    CHF: 2,
    CLP: 0,
    CNY: 2,
    COP: 2,
    CRC: 2,
    CSK: 2,
    CVE: 2,
    CZK: 2,
    DJF: 0,
    DKK: 2,
    DOP: 2,
    DZD: 2,
    EGP: 2,
    ERN: 2,
    ETB: 2,
    EUR: 2,
    FJD: 2,
    FKP: 2,
    GBP: 2,
    GEL: 2,
    GHS: 2,
    GIP: 2,
    GMD: 2,
    GNF: 0,
    GTQ: 2,
    GWP: 0,
    GYD: 2,
    HKD: 2,
    HNL: 2,
    HRK: 2,
    HTG: 2,
    HUF: 2,
    IDR: 2,
    ILS: 2,
    INR: 2,
    IQD: 3,
    ISK: 2,
    JMD: 2,
    JOD: 3,
    JPY: 0,
    KES: 2,
    KGS: 2,
    KHR: 2,
    KMF: 0,
    KRW: 0,
    KWD: 3,
    KYD: 2,
    KZT: 2,
    LAK: 2,
    LBP: 2,
    LKR: 2,
    LRD: 2,
    LSL: 2,
    LTL: 2,
    LVL: 2,
    MAD: 2,
    MDL: 2,
    MGA: 0,
    MKD: 2,
    MMK: 2,
    MNT: 2,
    MOP: 2,
    MRO: 2,
    MUR: 2,
    MVR: 2,
    MWK: 2,
    MXN: 2,
    MYR: 2,
    MZN: 2,
    NAD: 2,
    NGN: 2,
    NIO: 2,
    NOK: 2,
    NPR: 2,
    NZD: 2,
    OMR: 3,
    PAB: 2,
    PEN: 2,
    PGK: 2,
    PHP: 2,
    PKR: 2,
    PLN: 2,
    PYG: 0,
    QAR: 2,
    RON: 2,
    RSD: 2,
    RUB: 2,
    RWF: 0,
    SAR: 2,
    SBD: 2,
    SCR: 2,
    SEK: 2,
    SGD: 2,
    SHP: 2,
    SLL: 2,
    SOS: 2,
    SRD: 2,
    SSP: 2,
    STD: 2,
    SYP: 2,
    SZL: 2,
    THB: 2,
    TJS: 2,
    TND: 3,
    TOP: 2,
    TRY: 2,
    TTD: 2,
    TWD: 2,
    TZS: 2,
    UAH: 2,
    UGX: 2,
    USD: 2,
    UYU: 2,
    UZS: 2,
    VEF: 2,
    VND: 0,
    VUV: 0,
    WST: 2,
    XAF: 0,
    XCD: 2,
    XOF: 0,
    XPF: 0,
    YER: 2,
    ZAR: 2,
    ZMK: 2,
    ZMW: 2,
    ZWD: 2,
  }[currencyCode.toUpperCase()];
}

module.exports = Loyalty;
