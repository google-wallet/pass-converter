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

const { Storage } = require('@google-cloud/storage');
const { GoogleAuth } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const Pass = require('./pass');
const express = require('express');
const upload = require('express-fileupload');
const fs = require('fs');
const path = require('path');
const URL = require('url').URL;
const NodeCache = require('node-cache');
const nanoid = require('nanoid').nanoid;
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

/**
 * Path to service account key file from Google Cloud Console
 * @type {string}
 */
const serviceAccountFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || '/path/to/key.json';

/**
 * The issuer ID being updated in this request
 * @type {string}
 */
const issuerId = process.env.GOOGLE_ISSUER_ID || '<issuer ID>';

/**
 * Google Cloud Storage bucket name
 * @type {string}
 */
const storageBucket = process.env.GOOGLE_STORAGE_BUCKET;

/**
 * Internal cache of images
 * @type {NodeCache}
 */
const images = new NodeCache();

/**
 * Google Cloud service account credentials
 * @type {Object}
 */
const credentials = require(serviceAccountFile);

/**
 * Access scope for the Google Wallet API
 * @type {string}
 */
const scopes = 'https://www.googleapis.com/auth/wallet_object.issuer';

/**
 * HTTP client for making API calls
 * @type {GoogleAuth}
 */
const httpClient = new GoogleAuth({ credentials, scopes });

/**
 * Handler function for images to handle saving and hosting
 * @param {string} uri The URI of the image handler
 * @returns {Buffer} Request buffer
 * @todo `buffer()` is deprecated, use `body.arrayBuffer()` instead
 */
async function googleImageHandler(uri) {
  return (await fetch(uri)).buffer();
}

/**
 *
 * @param {Buffer} imageBuffer Binary string buffer for the image file
 * @returns {string} URI for the image on the image host
 */
async function pkpassImageHandler(imageBuffer, imageHost) {
  // Generate a randomized name for the image file
  const imageName = `image-${nanoid()}.png`;

  // If you're using Google Cloud Storage, this will store the image there
  // Otherwise, the image is added to the local cache
  if (storageBucket) {
    // Generate the object URI
    imageHost = `https://storage.googleapis.com/${storageBucket}/`;

    // Create a Cloud Storage client
    const storage = new Storage({ serviceAccountFile: serviceAccountFile });

    // Store the image in the bucket
    await storage.bucket(storageBucket).file(imageName).save(imageBuffer);
  } else if (imageHost) {
    if (new Set(['localhost', '127.0.0.1']).has(new URL(imageHost).hostname)) {
      return;
    }
    // Add the image to the cache
    images.set(imageName, imageBuffer);
  } else {
    // Called when converting pass locally without GCS configured
    throw 'Cannot determine public host for images...try setting the GOOGLE_STORAGE_BUCKET env var';
  }

  // Return the URI for the image
  return `${imageHost}${imageName}`;
}

/**
 * Convert from Google Wallet pass to Apple PKPass
 * @param {Object} googlePass The JWT's `payload` property
 * @returns {Buffer} Binary string buffer of the PKPass file data
 */
async function googleToPkPass(googlePass) {
  // Extract the pass data from the JWT payload
  const pass = Pass.fromGoogle(googlePass);

  // Return a string buffer
  return Buffer.from(await pass.toPkPass(googleImageHandler), 'base64');
}

function encodeJwt(payload, checkLength = true) {
  const token = jwt.sign(
    {
      iss: credentials.client_email,
      aud: 'google',
      origins: ['www.example.com'],
      typ: 'savetowallet',
      payload: payload,
    },
    credentials.private_key,
    { algorithm: 'RS256' },
  );
  const length = token.length;
  // Change the length check here to 0 to force API use,
  // or something large to skip API use, although some
  // browsers may not suport the request.
  if (checkLength && length > 1800) {
    throw `Encoded jwt too large (${length})`;
  }
  return token;
}

/**
 * Convert a PKPass to a Google Wallet pass
 * @param {Buffer} pkPass Binary string buffer for the PKPass archive
 * @param {string} imageHost Image host URL
 * @returns {string} Add to Google Wallet link
 */
async function pkPassToGoogle(pkPass, imageHost) {
  // Create the intermediary pass object
  const pass = Pass.fromPkPass(pkPass);

  // Convert to Google Wallet pass
  const googlePass = await pass.toGoogle(async imageBuffer => pkpassImageHandler(imageBuffer, imageHost));

  // Generate a class ID and object ID
  const classId = nanoid();
  const objectId = nanoid();

  // Add the IDs to the Google Wallet pass
  googlePass[pass.googlePrefix + 'Classes'][0].id = `${issuerId}.${classId}`;
  googlePass[pass.googlePrefix + 'Objects'][0].id = `${issuerId}.${objectId}-${classId}`;
  googlePass[pass.googlePrefix + 'Objects'][0].classId = `${issuerId}.${classId}`;

  // Create the JWT token for the "Save to Wallet" URL, avoiding the Wallet API if the token is small enough.
  // If the token is too large, strip the class from it and save it via API, and try again.
  // If the token is still too large, strip all but the ID from it, and save the object via API.
  let token;
  try {
    token = encodeJwt(googlePass);
  } catch (error) {
    // Create class via API.
    console.log(error, '- stripping class from payload and creating via api');
    try {
      await httpClient.request({
        url: `https://walletobjects.googleapis.com/walletobjects/v1/${pass.googlePrefix}Class/`,
        method: 'POST',
        data: googlePass[pass.googlePrefix + 'Classes'][0],
      });
    } catch (error) {
      console.error('Error creating class', error);
    }
    // Strip class from payload.
    delete googlePass[pass.googlePrefix + 'Classes'];
    try {
      token = encodeJwt(googlePass);
    } catch (error) {
      console.log(error, '- stripping object from payload and creating via api');
      try {
        // Create the object via API.
        await httpClient.request({
          url: `https://walletobjects.googleapis.com/walletobjects/v1/${pass.googlePrefix}Object/`,
          method: 'POST',
          data: googlePass[pass.googlePrefix + 'Objects'][0],
        });
      } catch (error) {
        console.error('Error creating object', error);
      }
      // Strip all but ID from payload.
      googlePass[pass.googlePrefix + 'Objects'][0] = {
        id: googlePass[pass.googlePrefix + 'Objects'][0].id,
      };
      token = encodeJwt(googlePass, false);
    }
  }

  // Return the Add to Google Wallet link
  return 'https://pay.google.com/gp/v/save/' + token;
}

/**
 * Send a string buffer to a destination, applying a specific MIME type
 * @param {Response} res Response from a previous HTTP request
 * @param {string} mimeType The MIME type for the send request
 * @param {string} name The name of the file to send
 * @param {Buffer} buffer The binary string buffer for the file contents
 */
function sendBuffer(res, mimeType, name, buffer) {
  res
    .set({
      // Set Content-Type and Content-Disposition
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename=${name}`,
    })
    .send(buffer);
}

// Start the Express server
const app = express();

// Mount the upload middleware to the root path
app.use(upload());

// Check if this is running as a demo
// If so, mount the static files middleware, using the 'public' directory
// This serves the demo page
const arg = i => (process.argv.length >= i + 1 ? process.argv[i] : undefined);
const demo = arg(2) === 'demo';
if (demo) {
  app.use(express.static(path.resolve(__dirname, 'public')));
}

/**
 * Get a hosted image (used by Google Wallet API during pass creation)
 * @name get/image/<name>
 * @param {string} path Express path
 * @param {callback} middleware Express middleware
 */
app.get('/image/:name', (req, res) => {
  sendBuffer(res, 'image/png', req.params.name, images.get(req.params.name));
});

/**
 * Recieve a pass object and convert it
 * @name post/
 * @param {string} path Express path
 * @param {callback} middleware Express middleware
 */
app.post('/', async (req, res) => {
  if (!demo && req.headers[process.env.CONVERTER_AUTH_HEADER] === undefined) {
    if (process.env.CONVERTER_AUTH_HEADER === undefined) {
      console.error('env var CONVERTER_AUTH_HEADER must be defined and set by upstream web server');
    }
    res.status(401).end();
    return;
  } else if (!req.files) {
    // No files were included in the request
    if (demo) {
      res.redirect('/');
    } else {
      res.status(400).end();
    }
    return;
  }

  // Get the files in the request and convert to string data
  const data = req.files[Object.keys(req.files)[0]].data;
  const text = data.toString();

  try {
    if (text.charAt(0) === '{') {
      // The file text is a JSON object (Google Wallet pass)
      // Convert it to a PKPass
      const pkPassBuffer = await googleToPkPass(JSON.parse(text));
      const name = 'pass.pkpass';

      // Save the pass to the hosting server
      sendBuffer(res, 'application/vnd.apple.pkpass', name, pkPassBuffer);
    } else {
      // The file is a PKPass
      // Convert to a Google Wallet pass
      const host = `${req.protocol}://${req.get('host')}${req.originalUrl}image/`;
      const googlePassUrl = await pkPassToGoogle(data, host);

      // Redirect to the Add to Google Wallet URL
      res.redirect(googlePassUrl);
    }
  } catch (error) {
    console.error(error);
    res.status(500).send('Conversion failed, please check console output for details');
  }
});

/**
 * Handles local conversion of passes on the command-line
 * @param {string} inputPath Path to input pass
 * @param {string} outputPath Path to save converted pass
 */
async function convertPassLocal(inputPath, outputPath) {
  // Get the file extension
  const ext = path.extname(inputPath);

  // Convert the pass to stringified JSON
  const stringify = pass => JSON.stringify(pass, null, 2);

  let pass;
  switch (ext) {
    case '.pkpass':
      // Convert a PKPass to a Google Wallet pass
      pass = await Pass.fromPkPass(fs.readFileSync(inputPath)).toGoogle(pkpassImageHandler);
      break;
    case '.json':
      // Convert a Google Wallet pass to a PKPass
      pass = await Pass.fromGoogle(require(inputPath)).toPkPass(googleImageHandler);
      break;
  }

  if (outputPath) {
    if (ext === '.pkpass') {
      // Convert the pass to a string
      pass = stringify(pass);
    }

    // Output to local filesystem
    fs.writeFileSync(outputPath, pass);
  } else {
    // Log the JSON output to the console
    if (ext === '.json') {
      // For PKPass, only log the pass.json contents
      pass = JSON.parse(new require('adm-zip')(pass).getEntry('pass.json').getData().toString('utf8'));
    }

    // Output to console
    console.log(stringify(pass));
  }
}

/**
 * Entrypoint - Handles command-line and Express server invocation
 */
async function main() {
  if (arg(2) && !demo) {
    // Command-line invocation
    await convertPassLocal(arg(2), arg(3));
  } else {
    // Express server invocation
    const host = process.env.CONVERTER_BIND_HOST || '127.0.0.1';
    const port = process.env.CONVERTER_BIND_PORT || 3000;
    app.listen(port, host, () => {
      console.log(`Listening on http://${host}:${port}`);
    });
  }
}

main().catch(console.error);
