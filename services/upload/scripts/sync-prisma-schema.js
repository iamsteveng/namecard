#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../../..');
const sourceSchema = path.join(projectRoot, 'packages', 'api', 'prisma', 'schema.prisma');
const targetDir = path.resolve(__dirname, '../prisma');
const targetSchema = path.join(targetDir, 'schema.prisma');

if (!fs.existsSync(sourceSchema)) {
  console.error('Prisma schema not found at', sourceSchema);
  process.exit(1);
}

fs.mkdirSync(targetDir, { recursive: true });
const contents = fs.readFileSync(sourceSchema, 'utf8');
fs.writeFileSync(targetSchema, contents);
console.log('Prisma schema synced to', targetSchema);
