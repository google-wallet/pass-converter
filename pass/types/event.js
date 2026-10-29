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
const { resolveFieldPath } = require('../utils');

/**
 * Represents an
 *     [Event ticket](https://developers.google.com/wallet/tickets/events)
 * @class
 * @extends Pass
 */
class Event extends Pass {
  // The Google Wallet pass type
  static googlePrefix = 'eventTicket';

  // The PKPass type
  static pkpassContentFields = 'eventTicket';

  /**
   * Create an Event object from a PKPass
   * @param {Object} json The PKPass archive JSON
   * @override
   * @instance
   */
  fromPkPass(json) {
    const title = this.hintedPkPassFieldValue('event.name', this.title);
    if (title === this.emptyValue) {
      throw 'Could not determine event name, please specify via hints.json';
    }
    this.title = title;
  }

  /**
   * Create an Event object from a Google Wallet pass
   * @param {Object} obj Google Wallet pass JSON
   * @param {string} cls Google Wallet class name
   * @override
   * @instance
   */
  fromGoogle(obj, cls) {
    this.update({
      title: this.fromGoogleLocalizedField(cls, 'eventName'),
      logo: this.fromGoogleImageField(cls.logo),
    });

    const template = cls.classTemplateInfo || {};
    const override = template.cardTemplateOverride || {};
    const rows = override.cardRowTemplateInfos || [];

    const fieldsToPkPass = (item) => {
      if (!item) return null;
      const fieldPath = (item.firstValue || {}).fieldPath;
      const resolved = resolveFieldPath(obj, cls, fieldPath);
      if (resolved && resolved.header && resolved.body) {
        return { key: resolved.id, label: resolved.header, value: resolved.body };
      }
      return null;
    };

    rows.forEach((row, i) => {
      const items = [];
      if (row.twoItems) {
        items.push(fieldsToPkPass(row.twoItems.startItem));
        items.push(fieldsToPkPass(row.twoItems.endItem));
      } else if (row.threeItems) {
        items.push(fieldsToPkPass(row.threeItems.startItem));
        items.push(fieldsToPkPass(row.threeItems.middleItem));
        items.push(fieldsToPkPass(row.threeItems.endItem));
      } else if (row.oneItem) {
        items.push(fieldsToPkPass(row.oneItem.item));
      }

      const validItems = items.filter(Boolean);
      if (i === 0) {
        this.secondaryFields = (this.secondaryFields || []).concat(validItems);
      } else {
        this.auxiliaryFields = (this.auxiliaryFields || []).concat(validItems);
      }
    });
  }

  /**
   * Generate a PKPass from this Event object
   * @param {Function} imageHandler Handler for image saving and hosting
   * @returns {Buffer} Binary string buffer of the PKPass archive
   * @override
   * @instance
   */
  async toPkPass(imageHandler) {
    this.setPkPassContentFields({
      primaryFields: [
        {
          key: 'title',
          value: this.title,
        },
      ],
      secondaryFields: this.secondaryFields || [],
      auxiliaryFields: this.auxiliaryFields || [],
    });
    return super.toPkPass(imageHandler);
  }

  /**
   * Generate a Google Wallet pass/class from this Event object
   * @param {Function} imageHandler Handler for image saving and hosting
   * @returns {Object} JSON representation of the pass classes and objects
   * @instance
   * @override
   */
  async toGoogle(imageHandler) {
    const pass = await super.toGoogle(imageHandler);

    this.update(pass.eventTicketClasses[0], {
      eventName: this.toGoogleLocalizedField(this.title),
      logo: this.toGoogleImageField(await imageHandler(this.logo)),
    });

    return pass;
  }
}

module.exports = Event;