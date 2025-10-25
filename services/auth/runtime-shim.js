const runtimeShim = require('./runtime-shim.ts');

// Bridge CommonJS consumers (e.g. Jest) to the TypeScript runtime shim exports.
module.exports = runtimeShim;
module.exports.ensureDatabaseUrl = runtimeShim.ensureDatabaseUrl;
module.exports.default = runtimeShim;
