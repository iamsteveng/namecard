#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(new URL('.', import.meta.url).pathname, '..');
const pnpmRoot = path.join(repoRoot, 'node_modules/.pnpm');

if (!fs.existsSync(pnpmRoot)) {
  console.error('[copy-prisma-assets] pnpm directory not found at', pnpmRoot);
  process.exit(1);
}

const prismaEntry = fs
  .readdirSync(pnpmRoot, { withFileTypes: true })
  .find((dir) => dir.isDirectory() && dir.name.startsWith('@prisma+client@'));

if (!prismaEntry) {
  console.error('[copy-prisma-assets] Unable to locate @prisma/client under', pnpmRoot);
  process.exit(1);
}

const packageRoot = path.join(pnpmRoot, prismaEntry.name, 'node_modules/@prisma/client');
const binaryRoot = path.join(pnpmRoot, prismaEntry.name, 'node_modules/.prisma/client');

if (!fs.existsSync(packageRoot) || !fs.existsSync(binaryRoot)) {
  console.error('[copy-prisma-assets] Prisma client directories missing');
  process.exit(1);
}

const cdkOut = path.join(repoRoot, 'infra/cdk.out');
const manifestPath = path.join(cdkOut, 'NameCardApi-staging.assets.json');
if (!fs.existsSync(manifestPath)) {
  console.error('[copy-prisma-assets] Asset manifest not found at', manifestPath);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const codeAssets = Object.entries(manifest.files)
  .filter(([, value]) => value.displayName?.endsWith('ServiceFunction/Code'))
  .map(([, value]) => path.join(cdkOut, value.source.path));

if (!codeAssets.length) {
  console.error('[copy-prisma-assets] No Lambda code assets found in manifest');
  process.exit(1);
}

function ensureRequirePrelude(assetPath) {
  const entryCandidates = ['index.mjs', 'index.js', 'main.mjs', 'main.js'];
  const entryPath = entryCandidates
    .map((candidate) => path.join(assetPath, candidate))
    .find((candidate) => fs.existsSync(candidate));

  if (!entryPath) {
    console.warn('[copy-prisma-assets] Skipping require shim injection for', assetPath, '(entry missing)');
    return;
  }

  const injectedMarker = '// -- injected-require-prelude --';
  const isModule = entryPath.endsWith('.mjs');
  const preludeLines = [injectedMarker];

  if (isModule) {
    preludeLines.push(
      'import { createRequire as __createRequire } from "module";',
      'const require = globalThis.require ?? __createRequire(import.meta.url);'
    );
  } else {
    preludeLines.push(
      'const { createRequire: __createRequire } = require("module");',
      'const require = globalThis.require ?? __createRequire(__filename);'
    );
  }

  preludeLines.push(
    'if (typeof globalThis.require !== "function") {',
    '  globalThis.require = require;',
    '  try {',
    '    (0, eval)("var require = globalThis.require;");',
    '  } catch {',
    '    // ignore if eval is restricted',
    '  }',
    '}',
    ''
  );

  const prelude = preludeLines.join('\n');
  const contents = fs.readFileSync(entryPath, 'utf8');

  if (contents.startsWith(injectedMarker)) {
    const rest = contents.split('\n').slice(preludeLines.length).join('\n');
    fs.writeFileSync(entryPath, prelude + rest, 'utf8');
    return;
  }

  fs.writeFileSync(entryPath, prelude + contents, 'utf8');
  console.log('[copy-prisma-assets] Injected require prelude into', entryPath);
}

for (const assetPath of codeAssets) {
  ensureRequirePrelude(assetPath);
  const packageDest = path.join(assetPath, 'node_modules/@prisma/client');
  const binaryDest = path.join(assetPath, 'node_modules/.prisma/client');
  fs.mkdirSync(packageDest, { recursive: true });
  fs.mkdirSync(binaryDest, { recursive: true });
  fs.cpSync(packageRoot, packageDest, { recursive: true });
  fs.cpSync(binaryRoot, binaryDest, { recursive: true });
  console.log('[copy-prisma-assets] Copied Prisma client into', assetPath);
}
