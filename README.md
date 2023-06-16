# Pass Converter

Pass converter is a tool to convert passes for different wallet apps from one wallet's format to another. Currently, this project supports the following wallet platforms:

- Google Wallet (the _payload_ field of a JWT, as a `.json` file)
- Apple Wallet (a `.pkpass` file)

The tool is built with JavaScript/Node.js and can run as a web service accepting a pass in a `POST` request, returning the converted pass as a response, or as a command-line tool for converting pass files locally.

**Note:** This project covers the server-side implementation for creating passes, it does not deal with any front-end concerns such as buttons for saving passes to wallets. For further guidance on this, please consult the branding and usage guidelines for each wallet platform.

# Table of contents

- [Supported pass types](#supported-pass-types)
- [Setup](#setup)
- [Usage](#usage)
- [Pass file formats](#pass-file-formats)
- [Configuration](#configuration)
- [External dependencies](#external-dependencies)
- [Hints for Google passes](#hints-for-google-passes)
- [Updatable Passes](#updatable-passes)
- [Troubleshooting](#troubleshooting)

## Supported pass types

The following table shows the mapping of pass types between each supported wallet platform.

| Type          | Google Wallet                                                                                                | Apple Wallet                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Boarding pass | [`FlightObject`](https://developers.google.com/wallet/tickets/boarding-passes/rest/v1/flightobject)          | [`Pass.BoardingPass` (`PKTransitTypeAir`)](https://developer.apple.com/documentation/walletpasses/pass/boardingpass) |
| Transit pass  | [`TransitObject`](https://developers.google.com/wallet/tickets/transit-passes/qr-code/rest/v1/transitobject) | [`Pass.BoardingPass` (other types)](https://developer.apple.com/documentation/walletpasses/pass/boardingpass)        |
| Offer/Coupon  | [`OfferObject`](https://developers.google.com/wallet/retail/offers/rest/v1/offerobject)                      | [`Pass.Coupon`](https://developer.apple.com/documentation/walletpasses/pass/coupon)                                  |
| Event ticket  | [`EventTicketObject`](https://developers.google.com/wallet/tickets/events/rest/v1/eventticketobject)         | [`Pass.EventTicket`](https://developer.apple.com/documentation/walletpasses/pass/eventticket)                        |
| Loyalty card  | [`LoyaltyObject`](https://developers.google.com/wallet/retail/loyalty-cards/rest/v1/loyaltyobject)           | [`Pass.StoreCard`](https://developer.apple.com/documentation/walletpasses/pass/storecard)                            |
| Generic       | [`GenericObject`](https://developers.google.com/wallet/generic/rest/v1/genericobject)                        | [`Pass.Generic`](https://developer.apple.com/documentation/walletpasses/pass/generic)                                |

## Setup

- Install [Node.js/NPM](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)
- Download or clone this repository
- Install dependencies using `npm install .`

## Usage

### Run the demo

```bash
node app.js demo
```

Provides a demo web page to test converting passes, which runs on [http://localhost:3000](http://localhost:3000) by default.

### Run via the command line

```bash
node app.js <pass input path> <pass output path>
```

Converts passes locally. If the output path is ommitted, the converter will output JSON to the terminal (for pkpass files, this will be the contents of pass.json).

### Run as a web service

```bash
node app.js
```

The web service expects a `POST` request to the URL `/convert/` with `multipart/form-data` encoding. The request should include a single pass file. Updating passes is also supported via `PATCH` requests to the same `/convert/` URL. See the [Updatable Passes](#updatable-passes) section for more detail.

#### Authentication

The web service must have some form of authentication implemented with an upstream web server (like Apache or Nginx). When configuring this in the upstream server, you must define a HTTP header in the request to the web service that the upstream web server will send. The name of the HTTP header must then be defined using the `config.js` variable `authHeader`. Requests to the converter are then restricted to requests containing the HTTP header.

#### Request

The request body must contain a single pass file, for one of the supported types. See next section _Pass file formats_ for an example request.

When converting to a Google Wallet pass, the pass converter will make additional API calls to Google Wallet to create the pass, if it is too large to be embedded directly in the "Save to Google Wallet" URL.

#### Response

The response format will depend on the destinaton platform of the pass.

| Target platform | Response type                                                   | Example                                                                                                       |
| --------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Google Wallet   | A 302 redirect to the URL for saving the pass to Google Wallet. | `https://pay.google.com/gp/v/save/{token}`                                                                    |
| Apple Wallet    | The PKPass file will be returned as a binary HTTP response.     | See [`PKPass`](https://developer.apple.com/documentation/passkit/pkpass) in the Apple developer documentation |

## Pass file formats

### Google Wallet pass

Google Wallet passes are defined by classes and objects which are created either via the Google Wallet APIs, using JWTs, or in the [Google Pay & Wallet Console](https://pay.google.com/business/console/home).

To learn more about the relationship between pass classes and objects, see [How classes and objects work](https://developers.google.com/wallet/generic/resources/how-classes-objects-work).

The pass converter defines a Google Wallet pass as a JSON file containing the value of the `payload` field of a JWT. The payload must include the pass class and object.

Here is a minimal example JWT payload that defines the pass class and pass object to be created:

```json
{
  "offerClasses": [
    {
      "reviewStatus": "UNDER_REVIEW",
      "issuerName": "Google",
      "redemptionChannel": "BOTH",
      "provider": "Google Developers",
      "title": "An open source project"
    }
  ],
  "offerObjects": [
    {
      "barcode": {
        "type": "qrCode",
        "value": "123456789"
      },
      "hexBackgroundColor": "#ce8c35",
      "state": "ACTIVE"
    }
  ]
}
```

**Important:** JWT payloads use `.json` as their extension, e.g., `mypass.json`.

### Apple `PKPass`

`PKPass` files are signed, compressed archives containing metadata, media, and other pass data. For more information on pass structure, see [Creating the Source for a Pass](https://developer.apple.com/documentation/walletpasses/creating_the_source_for_a_pass).

## Configuration

Configuration is implemented via a `config.js` file. You can define the path to your `config.js` file using the `PASS_CONVERTER_CONFIG_PATH` environment variable, otherwise the `config.js` file found in the root of this project is used.

The following variables are defined in the `config.js` file. Most of these are covered in more detail in the _External dependencies_ section next.

| `config.js` variable           | Description                                                                                                                                      | Example                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| `googleServiceAccountJsonPath` | Path to Google service account JSON file                                                                                                         | `/path/to/file.json`                                |
| `googleIssuerId`               | Issuer ID for Google Wallet APIs                                                                                                                 | `1234567890123456789`                               |
| `googleStorageBucket`          | Google Cloud Storage bucket name (see [Image hosting](#image-hosting))                                                                           | `my-bucket-name`                                    |
| `pkPassDefaultIconUrl`         | The URL to an image file to use for the `PKPass` icon/logo when none available in source pass                                                    | `https://link/to/icon.png`                          |
| `pkPassPassTypeId`             | Apple pass type ID                                                                                                                               | `.example-company.passes.ticket.event-4631A.`       |
| `pkPassTeamId`                 | Apple team ID                                                                                                                                    | `your-team-id`                                      |
| `pkPassSigningKeyPath`         | Path to your private key for signing `PKPass` files                                                                                              | `/path/to/key.pem`                                  |
| `pkPassSigningCertPath`        | Path to your certificate for signing `PKPass` files                                                                                              | `/path/to/cert.pem`                                 |
| `pkPassWwdrCertPath`           | Path to the Apple WWDR certificate for signing `PKPass` files                                                                                    | `/path/to/wwdr.pem`                                 |
| `emptyValue`                   | A default value to use for missing fields                                                                                                        | `N/A`                                               |
| `defaultOrgName`               | Default organization/issuer to use when none available in source pass                                                                            | `My company name`                                   |
| `defaultLanguage`              | The default language to use in Google Wallet passes (`PKPass` files with translations do not define the default language)                        | `en`                                                |
| `authHeader`                   | The HTTP header name your upstream web server will send to the converter when requests are authenticated (see [Authentication](#authentication)) | `Authorization`                                     |
| `bindHost`                     | The HTTP host to bind the converter to when running as a web service                                                                             | `127.0.0.1`                                         |
| `bindPort`                     | The HTTP port to bind the converter to when running as a web service                                                                             | `3000`                                              |
| `apn`                          | Config for Apple Push Notifications (see [node-apn documentation](https://github.com/node-apn/node-apn/blob/master/doc/provider.markdown))       | `{"cert": "cert.pem", "key": "key.pem"}`            |
| `database`                     | Config for database, (see [typeorm documentation](https://typeorm.io/data-source-options))                                                       | `{"type": "sqlite", "database": "database.sqlite"}` |
| `hints`                        | (Mapping of field name hints, see [Hints for Google passes](#hints-for-google-passes))                                                           | `{"event.name": ""}`                                |

## External dependencies

### Google Wallet API

When running as a command-line tool, you can convert passes to Google Wallet JWT payloads without any external dependencies. However, when running the tool as a web service, you will need to do the following:

- Create a [Google Cloud project](https://developers.google.com/workspace/guides/create-project)
- Follow the [prerequisites](https://developers.google.com/wallet/generic/web/prerequisites) for using the Google Wallet APIs (specifically, steps 1 through 4)

Once complete, you should have a service account JSON file and Google Wallet Issuer ID. These must then be configured as the `googleServiceAccountJsonPath` and `googleIssuerId` `config.js` variables, respectively.

### Image hosting

Images in Google Wallet passes are referenced by URLs. Thus, they must be hosted and available to Google when creating pass classes and objects. When this project is run as a web service, it will automatically host images found during conversion to Google Wallet passes.

You can also use [Google Cloud Storage](https://cloud.google.com/storage) to host the images. This has the added benefit of being able to restrict access to the service account mentioned earlier. To use Cloud Storage, you will need to follow the below steps.

1. [Create a bucket](https://cloud.google.com/storage/docs/creating-buckets)
2. Use [Cloud Identity and Access Management (Cloud IAM)](https://cloud.google.com/storage/docs/access-control/using-iam-permissions) to give your service account read/write access
3. Set the `googleStorageBucket` `config.js` variable to the name of the bucket you created

**Note:** You can still use the converter as a command-line tool to convert passes locally without configuring image hosting, however the resulting Google passes will not be usable without valid image URLs.

### Creating and signing Apple passes

To create valid `PKPass` files (they are cryptographically signed and viewable on Apple devices), you will need to follow the steps below.

**Note:** Omitting these steps and converting to unsigned Apple passes is also supported, however the resulting `PKPass` file will not be readable by an Apple device. In this case you may use the converter to create unsigned passes, then perform the signing in your own application separately.

1. Create an [Apple Developer Program](https://developer.apple.com/programs/) account, if you do not have one already
2. [Create a pass type identifier](https://developer.apple.com/documentation/walletpasses/building_a_pass)
3. [Create a certificate signing request (CSR)](https://help.apple.com/developer-account/#/devbfa00fef7)
4. [Generate and download the signing certificate](https://developer.apple.com/documentation/walletpasses/building_a_pass)
5. Import the signing certificate into the OSX keychain, and export it as _certificates.p12_
6. Download one of the [Apple Worldwide Developer Relations (WWDR) certificates](https://www.apple.com/certificateauthority/)
7. Import the WWDR root certificate into the OSX keychain, and export it as _wwdr.pem_
8. Install [OpenSSL](https://www.openssl.org/) (required for these setup steps, and also when running the pass converter)
9. Extract the certifcate from the _certificates.p12_ file with openssl:

```bash
openssl pkcs12 -in certificates.p12 -clcerts -nokeys -out mycert.pem
```

10. Extract the key from the _certificates.p12_ file with openssl:

```bash
openssl pkcs12 -in certificates.p12 -nocerts -nodes -out mykey.pem
```

11. Set the following `config.js` variables:

| `config.js` key         | Value                                                                     |
| ----------------------- | ------------------------------------------------------------------------- |
| `pkPassTeamId`          | Your Apple team ID (from step 1)                                          |
| `pkPassPassTypeId`      | The pass type identifier (from step 2)                                    |
| `pkPassWwdrCertPath`    | The path to the converted Apple WWDR certificate (_wwdr.pem_ from step 7) |
| `pkPassSigningCertPath` | The path to your signing certificate (_mycert.pem_ from step 9)           |
| `pkPassSigningKeyPath`  | The path to your private key (_mykey.pem_ from step 10)                   |

## Hints for Google passes

Google Wallet passes often have specific fields dedicated to specific information (such as a flight number in a boarding pass), while `PKPass` files may specify pass data more arbitrarily using [`PassFields`](https://developer.apple.com/documentation/walletpasses/passfields) (e.g. `auxilaryFields`, `backFields`, and `headerFields`).

In order to accommodate for this, you should configure the `hints` key in the `config.json` file. Here you can specify which `PassFields` properties map to which Google Wallet pass properties.

The following hints are currently supported.

| Pass type      | Hint name                 | Description               | Google Wallet pass property                                                                                                                                  |
| -------------- | ------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Events         | `event.name`              | Name of the event         | [`EventClass.eventName`](https://developers.google.com/wallet/tickets/events/rest/v1/eventticketclass)                                                       |
| Flights        | `flight.passenger`        | Passenger name            | [`FlightObject.passengerName`](https://developers.google.com/wallet/tickets/boarding-passes/rest/v1/flightobject)                                            |
|                | `flight.seatNumber`       | Seat number               | [`FlightObject.boardingAndSeatingInfo.seatNumber`](https://developers.google.com/wallet/tickets/boarding-passes/rest/v1/flightobject#boardingandseatinginfo) |
|                | `flight.seatClass`        | Seat class                | [`FlightObject.boardingAndSeatingInfo.seatClass`](https://developers.google.com/wallet/tickets/boarding-passes/rest/v1/flightobject#boardingandseatinginfo)  |
|                | `flight.gate`             | Gate number               | [`FlightClass.origin.gate`](https://developers.google.com/wallet/tickets/boarding-passes/rest/v1/flightclass#FlightClass.AirportInfo)                        |
|                | `flight.originCode`       | Origin airport code       | [`FlightClass.origin.airportIataCode`](https://developers.google.com/wallet/tickets/boarding-passes/rest/v1/flightclass#FlightClass.AirportInfo)             |
|                | `flight.destinationCode`  | Destination airport code  | [`FlightClass.destination.airportIataCode`](https://developers.google.com/wallet/tickets/boarding-passes/rest/v1/flightclass#FlightClass.AirportInfo)        |
|                | `flight.flightNumber`     | Flight number             | [`FlightClass.flightHeader.flightNumber`](https://developers.google.com/wallet/tickets/boarding-passes/rest/v1/flightclass#flightheader)                     |
|                | `flight.date`             | Departing date            | [`FlightClass.localScheduledDepartureDateTime`](https://developers.google.com/wallet/tickets/boarding-passes/rest/v1/flightclass)                            |
|                | `flight.time`             | Departing time            | [`FlightClass.localScheduledDepartureDateTime`](https://developers.google.com/wallet/tickets/boarding-passes/rest/v1/flightclass)                            |
|                | `flight.confirmationCode` | Booking/confirmation code | [`FlightObject.reservationInfo`](https://developers.google.com/wallet/tickets/boarding-passes/rest/v1/flightobject#reservationinfo)                          |
| Loyalty cards  | `loyalty.primaryPoints`   | Primary points balance    | [`LoyaltyObject.loyaltyPoints`](https://developers.google.com/wallet/retail/loyalty-cards/rest/v1/loyaltyobject#LoyaltyPoints)                               |
|                | `loyalty.secondaryPoints` | Secondary points balance  | [`LoyaltyObject.secondaryLoyaltyPoints`](https://developers.google.com/wallet/retail/loyalty-cards/rest/v1/loyaltyobject#LoyaltyPoints)                      |
| Transit passes | `transit.originName`      | Origin name               | [`TransitObject.ticketLeg.originName`](https://developers.google.com/wallet/tickets/transit-passes/qr-code/rest/v1/transitobject#ticketleg)                  |
|                | `transit.originDate`      | Departing date            | [`TransitObject.ticketLeg.departureDateTime`](https://developers.google.com/wallet/tickets/transit-passes/qr-code/rest/v1/transitobject#ticketleg)           |
|                | `transit.originTime`      | Departing time            | [`TransitObject.ticketLeg.departureDateTime`](https://developers.google.com/wallet/tickets/transit-passes/qr-code/rest/v1/transitobject#ticketleg)           |
|                | `transit.destinationName` | Destination name          | [`TransitObject.ticketLeg.destinationName`](https://developers.google.com/wallet/tickets/transit-passes/qr-code/rest/v1/transitobject#TicketLeg)             |
|                | `transit.destinationDate` | Arriving date             | [`TransitObject.ticketLeg.arrivalDateTime`](https://developers.google.com/wallet/tickets/transit-passes/qr-code/rest/v1/transitobject#ticketleg)             |
|                | `transit.destinationTime` | Arriving time             | [`TransitObject.ticketLeg.arrivalDateTime`](https://developers.google.com/wallet/tickets/transit-passes/qr-code/rest/v1/transitobject#ticketleg)             |

## Updatable Passes

Updating passes is supported via `PATCH` requests to the `/convert/` URL. These requests should contain a single pass file containing the content to use when updating an existing pass. The pass file should contain a valid identifier (eg `id` for a Google Pass, or `serialNumber` for a PKPass) that references the pass to update.

Following is the behavior for each of the formats:

### Apple `PKPass`

When a `PKPass` file is sent in the `PATCH` request, it is converted to a Google Wallet pass and updated via the Google Wallet API.

### Google Wallet pass

When a Google Wallet pass (.json) file is sent in the `PATCH` request, it is first updated via the Google Wallet API. Then, if the corresponding PKPass file that was created when the Google Wallet pass was created has been registered on an iOS device, a push token is sent to the iOS device signaling an update is available. The pass converter implements the web service endpoints required for managing updates to PKPass files. Consult the [Apple documentation](https://developer.apple.com/documentation/walletpasses/adding_a_web_service_to_update_passes) for further information.

**Note:** Managing updates to PKPass files requires the use of both Apple Push Notifications, and an internal database. Each of these are configured via `config.json` (see [configuration](#configuration)). Consult the [node-apn](https://github.com/node-apn/node-apn/blob/master/doc/provider.markdown) and [typeorm](https://typeorm.io/data-source-options) documentation for configuration details.

## Troubleshooting

On both platforms, most errors occur due to missing fields. You can identify them by checking the below.

### Google Wallet pass

The Google Wallet APIs are used to create passes. When errors occur, the API response is output to the local terminal including a detailed error message.

### Apple `PKPass`

If a PKPass file cannot be opened, follow the below steps.

1. Open the Console app on OSX
2. Start a new session and filter by "pkpass"
3. Try to open the pass on the same device

A detailed error message will appear in the Console app.
