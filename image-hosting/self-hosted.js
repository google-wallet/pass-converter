/*
 * Copyright 2024 Google Inc.
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

const fs = require('fs');
const path = require('path');

/**
 * Saves an image to the local public/uploads directory
 * @param {string} imageName Name of the file
 * @param {Buffer} imageBuffer File content
 * @param {string} imageHost The base URL for hosted images
 * @returns {string} Public URL of the image
 */
async function upload(imageName, imageBuffer, imageHost) {
  const uploadDir = path.resolve(__dirname, '../public/uploads');

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  fs.writeFileSync(path.join(uploadDir, imageName), imageBuffer);

  return `${imageHost}${imageName}`;
}

module.exports = { upload };