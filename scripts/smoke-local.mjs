#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { setTimeout as delay } from 'timers/promises';

import { register } from 'esbuild-register/dist/node';
import moduleAlias from 'module-alias';

const FRONTEND_BASE = process.env.SMOKE_WEB_URL || 'http://localhost:8080';
const LOCALSTACK_HEALTH =
  process.env.SMOKE_LOCALSTACK_HEALTH || 'http://localhost:4566/_localstack/health';
const SMOKE_USER_EMAIL = process.env.SMOKE_USER_EMAIL || 'demo@namecard.app';
const SMOKE_USER_PASSWORD = process.env.SMOKE_USER_PASSWORD || 'DemoPass123!';
const SMOKE_USER_NAME = process.env.SMOKE_USER_NAME || 'Demo User';
const TEST_TIMEOUT = Number(process.env.SMOKE_TIMEOUT_MS || 120000);

process.env.DATABASE_URL ||= 'postgresql://namecard_user:namecard_password@localhost:5432/namecard_dev';

const { unregister } = register({ extensions: ['.ts'], target: 'es2020' });
const repoRoot = path.resolve(new URL('.', import.meta.url).pathname, '..');
moduleAlias.addAlias('@namecard/shared', path.resolve(repoRoot, 'services/shared/src/index.ts'));
moduleAlias.addAlias('@namecard/shared/*', path.resolve(repoRoot, 'services/shared/src'));

let cachedToken;
let handlers;

async function loadLambdaHandlers() {
  if (handlers) {
    return handlers;
  }

  handlers = {
    auth: (await import('../services/auth/handler.ts')).handler,
    cards: (await import('../services/cards/handler.ts')).handler,
    search: (await import('../services/search/handler.ts')).handler,
    uploads: (await import('../services/uploads/handler.ts')).handler,
    ocr: (await import('../services/ocr/handler.ts')).handler,
    enrichment: (await import('../services/enrichment/handler.ts')).handler,
  };

  return handlers;
}

function createLambdaEvent({ method, path: rawPath, headers = {}, query, body }) {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );

  const queryEntries = query
    ? Object.entries(query).filter(([, value]) => value !== undefined && value !== null)
    : [];

  const queryStringParameters = queryEntries.length
    ? Object.fromEntries(queryEntries.map(([key, value]) => [key, String(value)]))
    : null;

  const rawQueryString = queryEntries.length
    ? new URLSearchParams(queryEntries.map(([key, value]) => [key, String(value)])).toString()
    : '';

  const serializedBody =
    typeof body === 'string' ? body : body != null ? JSON.stringify(body) : null;

  return {
    version: '2.0',
    httpMethod: method,
    routeKey: `${method} ${rawPath}`,
    rawPath,
    rawQueryString,
    headers: normalizedHeaders,
    queryStringParameters,
    pathParameters: null,
    body: serializedBody,
    isBase64Encoded: false,
    stageVariables: null,
    requestContext: { requestId: `smoke-${randomUUID()}` },
  };
}

async function invokeLambda(service, event) {
  const availableHandlers = await loadLambdaHandlers();
  const handler = availableHandlers[service];
  if (!handler) {
    throw new Error(`No lambda handler registered for service ${service}`);
  }

  const response = await handler(event);
  const payload = response.body ? JSON.parse(response.body) : undefined;
  return { response, payload };
}

async function ensureAuthToken() {
  if (cachedToken) {
    return cachedToken;
  }

  const lambdaEventBase = {
    headers: { 'content-type': 'application/json' },
  };

  const registerEvent = createLambdaEvent({
    ...lambdaEventBase,
    method: 'POST',
    path: '/v1/auth/register',
    body: {
      email: SMOKE_USER_EMAIL,
      password: SMOKE_USER_PASSWORD,
      name: SMOKE_USER_NAME,
    },
  });

  try {
    const { response, payload } = await invokeLambda('auth', registerEvent);
    if (response.statusCode >= 400) {
      throw new Error(`Lambda auth invocation failed (${response.statusCode})`);
    }
    cachedToken = payload?.data?.session?.accessToken;
    if (!cachedToken) {
      throw new Error('Registration succeeded but no access token was returned');
    }
    return cachedToken;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('(409)')) {
      throw error;
    }
  }

  const { response: loginResponse, payload: loginPayload } = await invokeLambda(
    'auth',
    createLambdaEvent({
      ...lambdaEventBase,
      method: 'POST',
      path: '/v1/auth/login',
      body: {
        email: SMOKE_USER_EMAIL,
        password: SMOKE_USER_PASSWORD,
      },
    })
  );

  if (loginResponse.statusCode >= 400) {
    throw new Error(`Login failed via lambda (${loginResponse.statusCode}): ${loginResponse.body}`);
  }

  cachedToken = loginPayload?.data?.session?.accessToken;
  if (!cachedToken) {
    throw new Error('Login succeeded but no access token was returned');
  }
  return cachedToken;
}

async function waitFor(url, options = {}) {
  const start = Date.now();
  while (Date.now() - start < TEST_TIMEOUT) {
    try {
      const response = await fetch(url, { method: 'GET' });
      if (response.ok) {
        return response;
      }
    } catch (_) {
      // retry
    }
    await delay(options.intervalMs || 3000);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function checkFrontendHealth() {
  await waitFor(`${FRONTEND_BASE}/health`);
}

async function checkLocalstack() {
  const response = await waitFor(LOCALSTACK_HEALTH, { intervalMs: 2000 });
  const data = await response.json();
  if (!data?.services) {
    throw new Error('LocalStack health payload missing services');
  }
}

async function callApi(path, init = {}) {
  const token = await ensureAuthToken();
  const url = new URL(path, 'http://lambda.local');
  const segments = url.pathname.split('/').filter(Boolean);

  if (segments.length < 3 || segments[0] !== 'api' || segments[1] !== 'v1') {
    throw new Error(`Unsupported path for lambda invocation: ${path}`);
  }

  const service = segments[2];
  const lambdaPath = `/v1/${segments.slice(2).join('/')}`;
  const method = init.method || 'GET';
  const query = Object.fromEntries(url.searchParams.entries());

  const headers = {
    authorization: `Bearer ${token}`,
    ...(init.headers ? Object.fromEntries(
      Object.entries(init.headers).map(([key, value]) => [key.toLowerCase(), value])
    ) : {}),
  };

  if (method !== 'GET' && !headers['content-type']) {
    headers['content-type'] = 'application/json';
  }

  const event = createLambdaEvent({
    method,
    path: lambdaPath,
    headers,
    query,
    body: init.body,
  });

  const { response, payload } = await invokeLambda(service, event);
  if (response.statusCode >= 400) {
    throw new Error(
      `Lambda ${service} invocation failed (${response.statusCode}): ${response.body}`
    );
  }

  return payload;
}

async function checkCardsEndpoint() {
  const data = await callApi('/api/v1/cards?limit=5');
  if (!data?.success) {
    throw new Error('Cards endpoint returned unsuccessful response');
  }
  if (!data?.data?.cards || data.data.cards.length === 0) {
    throw new Error('Cards endpoint returned no data; expected seeded cards');
  }
}

async function checkSearchSuggestions() {
  const response = await callApi('/api/v1/search/suggestions?prefix=Te&type=company');
  const suggestions = Array.isArray(response)
    ? response
    : Array.isArray(response?.data?.suggestions)
      ? response.data.suggestions
      : Array.isArray(response?.suggestions)
        ? response.suggestions
        : [];

  if (suggestions.length === 0) {
    throw new Error('Search suggestions did not return any suggestions');
  }
}

async function runSmokeSuite() {
  const steps = [
    { name: 'Frontend health', fn: checkFrontendHealth },
    { name: 'LocalStack health', fn: checkLocalstack },
    { name: 'Cards API', fn: checkCardsEndpoint },
    { name: 'Search suggestions', fn: checkSearchSuggestions },
  ];

  for (const step of steps) {
    process.stdout.write(`▶️  ${step.name}... `);
    await step.fn();
    console.log('ok');
  }

  console.log('\n✅ Local smoke suite passed — environment ready.');
}

runSmokeSuite().catch(error => {
  console.error('\n❌ Smoke suite failed:', error.message);
  process.exit(1);
});
