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
const database = require('./database.js');
const express = require('express');
const upload = require('express-fileupload');
const fs = require('fs');
const path = require('path');
const URL = require('url').URL;
const NodeCache = require('node-cache');
const nanoid = require('nanoid').nanoid;
const apn = require('apn');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const config = require('./config.js');

/**
 * Internal cache of images
 * @type {NodeCache}
 */
const images = new NodeCache();

/**
 * Google service account credentials
 * @type {Object}
 */
const credentials = config.googleServiceAccountJsonPath && require(config.googleServiceAccountJsonPath);

/**
 * HTTP client for making API calls
 * @type {GoogleAuth}
 */
const httpClient = new GoogleAuth({
  credentials: credentials,
  scopes: 'https://www.googleapis.com/auth/wallet_object.issuer',
});

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
  if (config.googleStorageBucket) {
    // Generate the object URI
    imageHost = `https://storage.googleapis.com/${config.googleStorageBucket}/`;

    // Create a Cloud Storage client
    const storage = new Storage({ serviceAccountFile: config.googleServiceAccountJsonPath });

    // Store the image in the bucket
    await storage.bucket(config.googleStorageBucket).file(imageName).save(imageBuffer);
  } else if (imageHost) {
    if (new Set(['localhost', '127.0.0.1']).has(new URL(imageHost).hostname)) {
      return;
    }
    // Add the image to the cache
    images.set(imageName, imageBuffer);
  } else {
    // Called when converting pass locally without GCS configured
    throw 'Cannot determine public host for images, googleStorageBucket config must be defined';
  }

  // Return the URI for the image
  return `${imageHost}${imageName}`;
}

/**
 * Convert from Google Wallet pass to Apple PKPass
 * @param {Object} googlePass The JWT's `payload` property
 * @returns {Buffer} Binary string buffer of the PKPass file data
 */
async function googleToPkPass(googlePass, apiHost) {
  // Extract the pass data from the JWT payload
  const pass = Pass.fromGoogle(googlePass);

  pass.webServiceURL = apiHost;
  pass.authenticationToken = nanoid();

  database.getRepository('passes').save({
    serialNumber: pass.id,
    webServiceURL: pass.webServiceURL,
    authenticationToken: pass.authenticationToken,
    passTypeId: config.pkPassPassTypeId,
    googlePrefix: pass.googlePrefix,
  });

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
  if (!credentials) {
    throw `Cannot convert to Google Wallet pass, googleServiceAccountJsonPath config must be defined`;
  }

  // Create the intermediary pass object
  const pass = Pass.fromPkPass(pkPass);

  // Convert to Google Wallet pass
  const googlePass = await pass.toGoogle(async imageBuffer => pkpassImageHandler(imageBuffer, imageHost));

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
app.use(upload());
app.use(express.json());

// Check if this is running as a demo
// If so, mount the static files middleware, using the 'public' directory
// This serves the demo page
const arg = i => (process.argv.length >= i + 1 ? process.argv[i] : undefined);
const DEMO = arg(2) === 'demo';
if (DEMO) {
  app.use(express.static(path.resolve(__dirname, 'public')));
}

/**
 * Get a hosted image (used by Google Wallet API during pass creation)
 */
app.get('/image/:name', (req, res) => {
  sendBuffer(res, 'image/png', req.params.name, images.get(req.params.name));
});

/**
 * Middleware wrapping pass conversion methods. Ensures auth header present,
 * and sets some request variables for the pass conversion to access.
 */
app.use('/convert/', (req, res, next) => {
  if (!DEMO && req.headers[config.authHeader] === undefined) {
    if (config.authHeader === undefined) {
      console.error('converterAuthHeader config must be defined and set by upstream web server');
    }
    res.status(401).end();
    return;
  } else if (!req.files) {
    // No files were included in the request
    res.status(400).end();
    return;
  }

  req.passFile = req.files[Object.keys(req.files)[0]].data;
  req.passText = req.passFile.toString();
  req.fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

  try {
    next();
  } catch (error) {
    console.error(error);
    res.status(500).send('Conversion failed, please check console output for details');
  }
});

/**
 * Receive a pass file and creates passes for the other supported platforms.
 */
app.post('/convert/', async (req, res) => {
  if (req.passText.charAt(0) === '{') {
    // The file text is a JSON object (Google Wallet pass), convert it to a PKPass
    const pkPassBuffer = await googleToPkPass(JSON.parse(req.passText), req.fullUrl);
    // Respond with the PKPass file
    sendBuffer(res, 'application/vnd.apple.pkpass', 'pass.pkpass', pkPassBuffer);
  } else {
    // The file is a PKPass, convert to a Google Wallet pass
    const googlePassUrl = await pkPassToGoogle(req.passFile, `${req.fullUrl}image/`);
    // Redirect to the Add to Google Wallet URL
    res.redirect(googlePassUrl);
  }
});

/**
 * Receive a pass file and uses it to update existing passes for all supported platforms.
 */
app.patch('/convert/', async (req, res) => {
  let pass, googlePass;
  if (req.passText.charAt(0) === '{') {
    googlePass = JSON.parse(req.passText);
    pass = Pass.fromGoogle(googlePass);

    database
      .getRepository('registrations')
      .find({ serialNumber: pass.id })
      .then(registrations => {
        const apnProvider = new apn.Provider(config.apn);
        registrations.forEach(registration => {
          apnProvider.send(new apn.Notification(), registration.pushToken).then(result => {
            console.log('apn push', result);
          });
        });
      });
  } else {
    pass = Pass.fromPkPass(req.passFile);
    googlePass = await pass.toGoogle(async imageBuffer => pkpassImageHandler(imageBuffer, `${req.fullUrl}image/`));
  }

  // Update the object via API.
  try {
    const id = googlePass[pass.googlePrefix + 'Objects'][0].id;
    const response = await httpClient.request({
      url: `https://walletobjects.googleapis.com/walletobjects/v1/${pass.googlePrefix}Objecst/${id}`,
      method: 'PATCH',
      data: googlePass[pass.googlePrefix + 'Objects'][0],
    });
    res.json(response.data);
  } catch (error) {
    console.error(error);
    res.status(error.response && error.response.status ? error.response.status : 400).end();
  }
});

// Remaining endpoints implement the spec for updatable PKPass files,
// as per https://developer.apple.com/documentation/walletpasses/adding_a_web_service_to_update_passes

/**
 * Middleware wrapping the endpoints for managing PKPass updates.
 * Validates auth token against database, and assigns matching pass record to the request.
 */
app.use('/v1/', (req, res, next) => {
  const prefix = 'ApplePass ';
  const header = req.headers['http_authorization'];
  const authenticationToken = header && header.indexOf(prefix) === 0 ? header.replace(prefix, '') : '';

  database
    .getRepository('passes')
    .findOne({
      where: {
        serialNumber: req.params.serialNumber,
        passTypeId: req.params.passTypeId,
        authenticationToken: authenticationToken,
      },
    })
    .then(pass => {
      if (pass === null) {
        res.status(401).end();
      } else {
        req.passRecord = pass;
        next();
      }
    });
});

/**
 * Called when PKPass is added to iOS device - create a registration record with push token we can send when pass is later updated.
 */
app.post('/v1/devices/:deviceId/registrations/:passTypeId/:serialNumber', (req, res) => {
  const uuid = `${req.params.device_id}-${req.params.serial_number}`;
  const registrations = database.getRepository('registrations');

  registrations.count({ where: { uuid } }).then(count => {
    const status = count === 0 ? 201 : 200;
    if (status === 201) {
      registrations.save({
        uuid: uuid,
        deviceId: req.params.passTypeId,
        passTypeId: req.params.passTypeId,
        serialNumber: req.params.serialNumber,
        pushToken: req.body['pushToken'],
      });
    }
    res.status(status).end();
  });
});

/**
 * Called when updated PKPass is requested.
 */
app.get('/v1/passes/:pass_type_id/:serial_number', async (req, res) => {
  // Retrieve pass content from Wallet API.
  httpClient
    .request({
      url: `https://walletobjects.googleapis.com/walletobjects/v1/${req.passRecord.googlePrefix}Object/${config.googleIssuerId}.${req.passRecord.serialNumber}`,
      method: 'GET',
    })
    .then(response => {
      // Convert to PKPass and send as response.
      Pass.fromGoogle({
        [`${req.passRecord.googlePrefix}Classes`]: [response.data.classReference],
        [`${req.passRecord.googlePrefix}Objects`]: [response.data],
      })
        .toPkPass(googleImageHandler)
        .then(pkPassBuffer => {
          sendBuffer(res, 'application/vnd.apple.pkpass', 'pass.pkpass', Buffer.from(pkPassBuffer, 'base64'));
        });
    })
    .catch(error => {
      console.error('Updated PKPass requested, but could not retrieve', error);
      res.status(400).end();
    });
});

/**
 * Called when PKPass is removed from device - remove registration record.
 */
app.delete('/v1/devices/:device_id/registrations/:pass_type_id/:serial_number', (req, res) => {
  const uuid = `${req.params.device_id}-${req.params.serial_number}`;
  const registrations = database.getRepository('registrations');

  registrations.findOne({ where: { uuid } }).then(registration => {
    let status = 401;
    if (registration != null) {
      status = 201;
      registrations.remove(registration);
    }
    res.status(status).end();
  });
});

/**
 * Handles local conversion of passes on the command-line
 * @param {string} inputPath Path to input pass
 * @param {string} outputPath Path to save converted pass
 */
async function convertPassLocal(inputPath, outputPath) {
  // Converts the pass to stringified JSON
  const stringify = pass => JSON.stringify(pass, null, 2);

  const ext = path.extname(inputPath);
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
    // Write to local filesystem
    if (ext === '.pkpass') {
      // Convert the pass to a string
      pass = stringify(pass);
    }
    fs.writeFileSync(outputPath, pass);
  } else {
    // Write the JSON output to the console
    if (ext === '.json') {
      // For PKPass, use the pass.json contents
      pass = JSON.parse(new require('adm-zip')(pass).getEntry('pass.json').getData().toString('utf8'));
    }
    console.log(stringify(pass));
  }
}

/**
 * Entrypoint - Handles command-line and Express server invocation
 */
async function main() {
  if (arg(2) && !DEMO) {
    // Command-line invocation
    await convertPassLocal(arg(2), arg(3));
  } else {
    database.initialize();
    // Express server invocation
    app.listen(config.bindPort, config.bindHost, () => {
      console.log(`Listening on http://${config.bindHost}:${config.bindPort}`);
    });
  }
}

main().catch(console.error);
