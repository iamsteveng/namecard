#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const [,, outputDir] = process.argv;

if (!outputDir) {
  console.error('[inject-require] Missing output directory argument');
  process.exit(1);
}

const entryCandidates = ['index.mjs', 'index.js', 'main.mjs', 'main.js'];
const entryPath = entryCandidates
  .map((candidate) => path.join(outputDir, candidate))
  .find((candidate) => fs.existsSync(candidate));

if (!entryPath) {
  console.error('[inject-require] No entry file found under', outputDir);
  process.exit(1);
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
  console.log('[inject-require] Updated require shim in', entryPath);
  process.exit(0);
}

fs.writeFileSync(entryPath, prelude + contents, 'utf8');
console.log('[inject-require] Prefixed require shim into', entryPath);
