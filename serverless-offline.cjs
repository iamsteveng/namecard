'use strict';

const offline = require('serverless-offline');

module.exports = offline && offline.default ? offline.default : offline;
