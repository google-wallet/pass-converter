const typeorm = require('typeorm');
const config = require('./config.js');

const passes = new typeorm.EntitySchema({
  name: 'passes',
  columns: {
    id: { primary: true, type: 'int', generated: true },
    serialNumber: { type: 'varchar' },
    authenticationToken: { type: 'varchar' },
    passTypeId: { type: 'varchar' },
    googlePrefix: { type: 'varchar' },
  },
});

const registrations = new typeorm.EntitySchema({
  name: 'registrations',
  columns: {
    id: { primary: true, type: 'int', generated: true },
    uuid: { type: 'varchar' },
    deviceId: { type: 'varchar' },
    pushToken: { type: 'varchar' },
    serialNumber: { type: 'varchar' },
    passTypeId: { type: 'varchar' },
  },
});

module.exports = new typeorm.DataSource(Object.assign({ entities: [passes, registrations] }, config.database));
