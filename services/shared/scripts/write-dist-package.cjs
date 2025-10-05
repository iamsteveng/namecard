#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, '..', 'dist');
if (!fs.existsSync(distDir)) {
  process.exit(0);
}

const pkgPath = path.join(distDir, 'package.json');
const pkg = {
  type: 'commonjs',
};
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
