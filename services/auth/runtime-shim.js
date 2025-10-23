const runtimeShim = require('./runtime-shim.ts');

// Ensure both CommonJS and ESM consumers can access the named export.
module.exports = runtimeShim;
module.exports.ensureDatabaseUrl = runtimeShim.ensureDatabaseUrl;
module.exports.default = runtimeShim;
