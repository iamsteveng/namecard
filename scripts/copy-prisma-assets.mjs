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

const args = process.argv.slice(2);
const targetFlagIndex = args.findIndex((value) => value === '--bundle' || value === '--target');
const singleTarget = targetFlagIndex !== -1 ? args[targetFlagIndex + 1] : undefined;

const collectedTargets = [];

if (singleTarget) {
  collectedTargets.push(path.resolve(process.cwd(), singleTarget));
} else {
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

    collectedTargets.push(...codeAssets);
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
      'import { fileURLToPath as __fileURLToPath } from "url";',
      'import path from "path";',
      'const __bundledRequire = globalThis.require ?? __createRequire(import.meta.url);',
      'if (typeof globalThis.require !== "function") {',
      '  globalThis.require = __bundledRequire;',
      '}',
      'const __currentFilename = __fileURLToPath(import.meta.url);',
      'if (typeof globalThis.__filename !== "string") {',
      '  globalThis.__filename = __currentFilename;',
      '}',
      'const __currentDirname = path.dirname(__currentFilename);',
      'if (typeof globalThis.__dirname !== "string") {',
      '  globalThis.__dirname = __currentDirname;',
      '}'
    );
  } else {
    preludeLines.push(
      'const { createRequire: __createRequire } = require("module");',
      'const path = require("path");',
      'const __bundledRequire = globalThis.require ?? __createRequire(__filename);',
      'if (typeof globalThis.require !== "function") {',
      '  globalThis.require = __bundledRequire;',
      '}',
      'if (typeof globalThis.__dirname !== "string") {',
      '  globalThis.__dirname = path.dirname(__filename);',
      '}'
    );
  }

  preludeLines.push('');

  const prelude = preludeLines.join('\n');
  const contents = fs.readFileSync(entryPath, 'utf8');
  const stripped = contents.startsWith(injectedMarker)
    ? contents.replace(/^\/\/ -- injected-require-prelude --[\s\S]*?\n\n/, '')
    : contents;

  fs.writeFileSync(entryPath, prelude + stripped, 'utf8');
  console.log('[copy-prisma-assets] Injected require prelude into', entryPath);
}

for (const assetPath of collectedTargets) {
  ensureRequirePrelude(assetPath);
  const packageDest = path.join(assetPath, 'node_modules/@prisma/client');
  const binaryDest = path.join(assetPath, 'node_modules/.prisma/client');
  fs.mkdirSync(packageDest, { recursive: true });
  fs.mkdirSync(binaryDest, { recursive: true });
  fs.cpSync(packageRoot, packageDest, { recursive: true });
  fs.cpSync(binaryRoot, binaryDest, { recursive: true });
  console.log('[copy-prisma-assets] Copied Prisma client into', assetPath);
}
