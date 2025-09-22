#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '../../..');
const serviceRoot = path.resolve(__dirname, '..');

const schemaPath = path.join('packages', 'api', 'prisma', 'schema.prisma');

console.log('Generating Prisma client using schema at', schemaPath);
execSync(`npx prisma generate --schema ${schemaPath}`, {
  cwd: projectRoot,
  stdio: 'inherit',
});

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`Source path not found: ${src}`);
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

const sourcePrismaDir = path.join(projectRoot, 'node_modules', '.prisma');
const targetPrismaDir = path.join(serviceRoot, 'node_modules', '.prisma');
console.log('Copying Prisma engines from', sourcePrismaDir, 'to', targetPrismaDir);
copyDir(sourcePrismaDir, targetPrismaDir);

const sourceClientDir = path.join(projectRoot, 'node_modules', '@prisma');
const targetClientDir = path.join(serviceRoot, 'node_modules', '@prisma');
console.log('Copying Prisma client from', sourceClientDir, 'to', targetClientDir);
copyDir(sourceClientDir, targetClientDir);

console.log('Prisma client assets copied successfully');
