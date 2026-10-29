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

const { Storage } = require('@google-cloud/storage');
const config = require('../config.js');

/**
 * Uploads an image to Google Cloud Storage
 * @param {string} imageName Name of the file
 * @param {Buffer} imageBuffer File content
 * @returns {string} Public URL of the image
 */
async function upload(imageName, imageBuffer) {
  if (!config.googleStorageBucket) {
    throw new Error('googleStorageBucket config is not defined for GCS image hosting');
  }

  const storage = new Storage({ serviceAccountFile: config.googleServiceAccountJsonPath });
  await storage.bucket(config.googleStorageBucket).file(imageName).save(imageBuffer);

  return `https://storage.googleapis.com/${config.googleStorageBucket}/${imageName}`;
}

module.exports = { upload };