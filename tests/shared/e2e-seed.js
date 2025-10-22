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

function resolveApiBaseUrl(explicitBaseUrl) {
  const envBaseUrl =
    explicitBaseUrl ??
    process.env['WEB_E2E_API_BASE_URL'] ??
    process.env['API_BASE_URL'] ??
    null;

  const fallback = envBaseUrl && typeof envBaseUrl === 'string' && envBaseUrl.trim().length
    ? envBaseUrl
    : 'http://localhost:3001';

  return fallback.replace(/\/+$/, '');
}

function ensureFetchImplementation(candidate) {
  const impl = candidate ?? globalThis.fetch;
  if (typeof impl !== 'function') {
    throw new Error('Global fetch implementation is required for auth bootstrap helpers.');
  }
  return impl;
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    const err = new Error('Expected JSON response but received invalid payload');
    err.cause = error;
    err.responseText = text;
    throw err;
  }
}

async function invokeJsonEndpoint(fetchImpl, url, { method = 'GET', body, headers = {} } = {}) {
  const normalizedHeaders = {
    'content-type': 'application/json',
    ...headers,
  };

  const response = await fetchImpl(url, {
    method,
    headers: normalizedHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload;
  try {
    payload = await readJsonResponse(response);
  } catch (error) {
    if (response.ok) {
      throw error;
    }
    payload = { error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }

  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
}

function toSessionSnapshot(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Auth response missing payload data.');
  }

  const container = payload['data'];
  if (!container || typeof container !== 'object') {
    throw new Error('Auth response missing data wrapper.');
  }

  const user = container['user'];
  const session = container['session'];

  if (!user || typeof user !== 'object') {
    throw new Error('Auth response missing user payload.');
  }
  if (!session || typeof session !== 'object') {
    throw new Error('Auth response missing session payload.');
  }

  const userId = user['id'];
  const email = user['email'];
  if (!userId || !email) {
    throw new Error('Auth response missing required user identifiers.');
  }

  return {
    user: {
      ...user,
      id: String(userId),
      email: String(email).toLowerCase(),
    },
    session: {
      ...session,
      accessToken: String(session['accessToken'] ?? ''),
      refreshToken:
        session['refreshToken'] !== undefined && session['refreshToken'] !== null
          ? String(session['refreshToken'])
          : null,
      expiresAt:
        session['expiresAt'] !== undefined && session['expiresAt'] !== null
          ? String(session['expiresAt'])
          : null,
    },
  };
}

function buildHttpError(operation, status, payload) {
  const payloadMessage =
    (payload && typeof payload === 'object' && payload.error && payload.error.message) ||
    (payload && typeof payload === 'object' && payload.message) ||
    'Unknown error';
  const error = new Error(`${operation} failed with status ${status}: ${payloadMessage}`);
  error.status = status;
  error.payload = payload;
  return error;
}

function shouldAttemptRegistration(error) {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const status = error.status;
  return status === 401 || status === 404;
}

function deriveDisplayName(email, fallback) {
  if (typeof fallback === 'string' && fallback.trim().length > 0) {
    return fallback;
  }
  if (typeof email === 'string' && email.includes('@')) {
    return email.split('@')[0];
  }
  return 'E2E Session User';
}

async function performLogin(fetchImpl, baseUrl, credentials) {
  const url = `${baseUrl}/v1/auth/login`;
  const result = await invokeJsonEndpoint(fetchImpl, url, {
    method: 'POST',
    body: {
      email: credentials.email,
      password: credentials.password,
    },
  });

  if (!result.ok) {
    throw buildHttpError('Auth login', result.status, result.payload);
  }

  return toSessionSnapshot(result.payload);
}

async function performRegistration(fetchImpl, baseUrl, credentials) {
  const url = `${baseUrl}/v1/auth/register`;
  const result = await invokeJsonEndpoint(fetchImpl, url, {
    method: 'POST',
    body: {
      email: credentials.email,
      password: credentials.password,
      name: credentials.name,
    },
  });

  if (!result.ok) {
    throw buildHttpError('Auth registration', result.status, result.payload);
  }

  return toSessionSnapshot(result.payload);
}

export async function bootstrapAuthSession(options = {}) {
  const {
    baseUrl: explicitBaseUrl,
    email: providedEmail,
    password: providedPassword,
    name: providedName,
    registerIfMissing = true,
    useSharedSeed = true,
    fetch: fetchOverride,
    fallbackToDefaults = true,
  } = options ?? {};

  const fetchImpl = ensureFetchImplementation(fetchOverride);
  const baseUrl = resolveApiBaseUrl(explicitBaseUrl);

  let email = providedEmail;
  let password = providedPassword;
  let seedUserId = null;
  let usedSharedSeed = false;

  if ((!email || !password) && useSharedSeed) {
    const seedState = await readSharedSeedState().catch(() => null);
    if (seedState?.user?.email && seedState?.user?.password) {
      email ||= seedState.user.email;
      password ||= seedState.user.password;
      seedUserId = seedState.user.userId ?? null;
      usedSharedSeed = true;
    }
  }

  if ((!email || !password) && fallbackToDefaults) {
    email ||= DEFAULT_SEED_USER_EMAIL;
    password ||= DEFAULT_SEED_USER_PASSWORD;
    seedUserId ||= DEFAULT_SEED_USER_ID;
  }

  if (!email || !password) {
    throw new Error('Auth bootstrap requires email and password credentials.');
  }

  const name = deriveDisplayName(email, providedName);
  const startedAt = Date.now();

  try {
    const snapshot = await performLogin(fetchImpl, baseUrl, { email, password });
    const elapsedMs = Date.now() - startedAt;
    return {
      ...snapshot,
      meta: {
        baseUrl,
        elapsedMs,
        registered: false,
        usedSharedSeed,
        seedUserId,
      },
    };
  } catch (error) {
    if (!registerIfMissing || !shouldAttemptRegistration(error)) {
      throw error;
    }

    await performRegistration(fetchImpl, baseUrl, { email, password, name });

    const snapshot = await performLogin(fetchImpl, baseUrl, { email, password });
    const elapsedMs = Date.now() - startedAt;

    return {
      ...snapshot,
      meta: {
        baseUrl,
        elapsedMs,
        registered: true,
        usedSharedSeed,
        seedUserId,
      },
    };
  }
}

export function buildPersistedAuthState(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('Persisted auth state requires an input object.');
  }

  const { user, session, isAuthenticated = true } = input;

  if (!user || typeof user !== 'object') {
    throw new Error('Persisted auth state requires a user object.');
  }

  if (!session || typeof session !== 'object') {
    throw new Error('Persisted auth state requires a session object.');
  }

  const normalizedSession = {
    ...session,
    expiresAt:
      session.expiresAt ?? new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  };

  return {
    version: 0,
    state: {
      user,
      session: normalizedSession,
      isAuthenticated: Boolean(isAuthenticated),
    },
  };
}
