import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(moduleDir, '..', '..');
export const fixturesDir = resolve(repoRoot, 'tests', 'fixtures');
export const cardFixturePath = resolve(fixturesDir, 'card-sample.jpg');

export const DEFAULT_SEED_USER_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
export const DEFAULT_SEED_USER_EMAIL = 'test@namecard.app';
export const DEFAULT_SEED_USER_PASSWORD = 'SeededE2E!123';

function resolveSeedStatePathOverride(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  if (value.startsWith('/')) {
    return value;
  }

  return resolve(repoRoot, value);
}

export const seedStatePath = resolveSeedStatePathOverride(process.env['E2E_SEED_STATE_PATH']) ??
  resolve(repoRoot, 'out', 'e2e-seed-state.json');

export async function ensureCardFixture() {
  const stats = await fs.stat(cardFixturePath);
  if (!stats.isFile()) {
    throw new Error(`Card fixture missing or not a file: ${cardFixturePath}`);
  }
  return { path: cardFixturePath, size: stats.size };
}

export async function readSharedSeedState() {
  try {
    const raw = await fs.readFile(seedStatePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return parsed;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function writeSharedSeedState(state) {
  if (!state || typeof state !== 'object') {
    throw new Error('Shared seed state must be an object.');
  }

  const payload = {
    ...state,
    version: typeof state.version === 'number' ? state.version : 1,
    source: state.source ?? 'api-e2e',
    generatedAt: new Date().toISOString(),
  };

  await fs.mkdir(dirname(seedStatePath), { recursive: true });
  await fs.writeFile(seedStatePath, JSON.stringify(payload, null, 2), 'utf8');
}

export async function removeSharedSeedState() {
  try {
    await fs.unlink(seedStatePath);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return;
    }
    throw error;
  }
}

export function describeSeedSummary(state) {
  if (!state || typeof state !== 'object') {
    return 'No shared seed state available';
  }

  const userEmail = state?.user?.email;
  const cardName = state?.card?.name;
  const cardCompany = state?.card?.company;

  const parts = [];
  if (userEmail) {
    parts.push(`user: ${userEmail}`);
  }
  if (cardName || cardCompany) {
    parts.push(`card: ${[cardName, cardCompany].filter(Boolean).join(' @ ')}`);
  }
  return parts.length ? parts.join('; ') : 'Seed state loaded';
}
