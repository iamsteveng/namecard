#!/usr/bin/env node
import { setTimeout as delay } from 'timers/promises';

const API_BASE = process.env.SMOKE_API_URL || 'http://localhost:3001';
const FRONTEND_BASE = process.env.SMOKE_WEB_URL || 'http://localhost:8080';
const LOCALSTACK_HEALTH = process.env.SMOKE_LOCALSTACK_HEALTH || 'http://localhost:4566/_localstack/health';
const AUTH_HEADER = process.env.SMOKE_AUTH_HEADER || 'Bearer dev-bypass-token';
const TEST_TIMEOUT = Number(process.env.SMOKE_TIMEOUT_MS || 120000);

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

async function checkApiHealth() {
  const response = await waitFor(`${API_BASE}/health`);
  const data = await response.json();
  if (!data?.status || data.status !== 'ok') {
    throw new Error('API health check did not return ok');
  }
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
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: AUTH_HEADER,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    ...init,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API request to ${path} failed (${response.status}): ${text}`);
  }
  return response.json();
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
    { name: 'API health', fn: checkApiHealth },
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
