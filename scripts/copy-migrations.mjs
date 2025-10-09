#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');
const cdkOutDir = resolve(repoRoot, 'infra/cdk.out');
const servicesDir = resolve(repoRoot, 'services');
const assetsManifestPath = resolve(cdkOutDir, 'NameCardApi-staging.assets.json');

if (!existsSync(assetsManifestPath)) {
  throw new Error('NameCardApi-staging.assets.json missing; run synth first.');
}

const manifest = JSON.parse(readFileSync(assetsManifestPath, 'utf8'));
const schemaAssetEntry = Object.entries(manifest.files ?? {}).find(([, value]) =>
  typeof value?.displayName === 'string' && value.displayName.includes('SchemaMigrator/Code')
);

if (!schemaAssetEntry) {
  throw new Error('Schema migrator asset not found in manifest.');
}

const [, schemaAsset] = schemaAssetEntry;
if (!schemaAsset?.source?.path) {
  throw new Error('Schema migrator asset path missing in manifest.');
}
const schemaAssetDir = resolve(cdkOutDir, schemaAsset.source.path);
const targetDir = resolve(schemaAssetDir, 'migrations');
if (!existsSync(targetDir)) {
  mkdirSync(targetDir, { recursive: true });
}

const serviceEntries = readdirSync(servicesDir, { withFileTypes: true });
let copied = 0;
for (const entry of serviceEntries) {
  if (!entry.isDirectory()) continue;
  const migrationsDir = resolve(servicesDir, entry.name, 'migrations');
  if (!existsSync(migrationsDir)) continue;
  const files = readdirSync(migrationsDir);
  for (const file of files) {
    if (!file.endsWith('.sql')) continue;
    const source = resolve(migrationsDir, file);
    if (!statSync(source).isFile()) continue;
    const dest = resolve(targetDir, file);
    cpSync(source, dest, { force: true });
    copied += 1;
  }
}

console.log(`[copy-migrations] Copied ${copied} migrations into ${targetDir}`);
