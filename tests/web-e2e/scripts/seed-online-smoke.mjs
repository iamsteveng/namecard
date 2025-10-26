#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

import { writeSharedSeedState } from '../../shared/e2e-seed.js';

const requiredEnv = name => {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value.trim();
};

const apiBaseUrl =
  process.env['WEB_E2E_API_BASE_URL'] ??
  process.env['API_BASE_URL'] ??
  'https://frepw21wc8.execute-api.ap-southeast-1.amazonaws.com/staging';
const email = requiredEnv('E2E_EMAIL');
const password = requiredEnv('E2E_PASSWORD');
const displayName = process.env['E2E_NAME']?.trim() || 'Hosted E2E User';

const normalizeBase = url => url.replace(/\/$/, '');
const buildUrl = (base, pathFragment) => {
  const normalized = pathFragment.startsWith('/') ? pathFragment : `/${pathFragment}`;
  return `${normalizeBase(base)}${normalized}`;
};

const apiFetch = async (pathFragment, { method = 'GET', headers = {}, body } = {}) => {
  const target = buildUrl(apiBaseUrl, pathFragment);
  const response = await fetch(target, {
    method,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body,
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : undefined;
  } catch (error) {
    throw new Error(`Failed to parse JSON response from ${target}: ${error.message}`);
  }

  return { response, payload };
};

const ensureOutDir = async () => {
  const outDir = path.resolve('out');
  await fs.mkdir(outDir, { recursive: true });
};

const seed = async () => {
  console.log(`[seed] Seeding staged smoke data for ${email}`);

  const registerAttempt = await apiFetch('/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name: displayName }),
  });

  if (registerAttempt.response.ok) {
    console.log('[seed] Registered new staging user');
  } else if (registerAttempt.response.status === 409) {
    console.log('[seed] User already exists; continuing');
  } else {
    throw new Error(
      `[seed] Registration failed (${registerAttempt.response.status}): ${registerAttempt.payload?.error?.message || registerAttempt.response.statusText}`
    );
  }

  const loginResult = await apiFetch('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  if (!loginResult.response.ok) {
    throw new Error(
      `[seed] Login failed (${loginResult.response.status}): ${loginResult.payload?.error?.message || loginResult.response.statusText}`
    );
  }

  const { user, session } = loginResult.payload.data;
  const authHeaders = { Authorization: `Bearer ${session.accessToken}` };

  const listResult = await apiFetch('/v1/cards', {
    method: 'GET',
    headers: authHeaders,
  });

  if (!listResult.response.ok) {
    throw new Error(
      `[seed] Failed to list cards (${listResult.response.status}): ${listResult.payload?.error?.message || listResult.response.statusText}`
    );
  }

  const targetCard = listResult.payload.data.cards.find(
    card => card.name === 'David W. L. Ng' && card.company === 'Sino Land Company Limited'
  );

  if (!targetCard) {
    const cardPayload = {
      originalImageUrl: 'https://d11ofb8v2c3wun.cloudfront.net/tests/fixtures/card-sample.jpg',
      extractedText:
        'SINO GROUP\nDavid W. L. Ng\nGroup Associate Director\nSino Land Company Limited\n11 - 12/F, Tsim Sha Tsui Centre, Salisbury Road\nTsim Sha Tsui, Kowloon, Hong Kong\nT: (852) 2721 8388\nDL : (852) 2132 8222\nE : davidng@sino.com\nwww.sino.com',
      confidence: 0.9,
      name: 'David W. L. Ng',
      title: 'Group Associate Director',
      company: 'Sino Land Company Limited',
      email: 'davidng@sino.com',
      phone: '+852-2721-8388',
      address: '11 - 12/F, Tsim Sha Tsui Centre, Salisbury Road, Tsim Sha Tsui, Kowloon, Hong Kong',
      website: 'https://www.sino.com',
      notes: 'Seeded via smoke automation',
      tags: ['priority', 'vip'],
      scanDate: new Date().toISOString(),
    };

    const createResult = await apiFetch('/v1/cards', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(cardPayload),
    });

    if (!createResult.response.ok) {
      throw new Error(
        `[seed] Failed to create card (${createResult.response.status}): ${createResult.payload?.error?.message || createResult.response.statusText}`
      );
    }

    console.log('[seed] Created seed card for hosted smoke test');
  } else {
    console.log('[seed] Seed card already present, skipping creation');
  }

  await ensureOutDir();
  await writeSharedSeedState({
    source: 'staging-online-smoke',
    env: 'staging',
    user: {
      userId: user.id,
      email,
      password,
    },
    card: {
      id: targetCard?.id,
      name: 'David W. L. Ng',
      company: 'Sino Land Company Limited',
      email: 'davidng@sino.com',
      tags: ['priority', 'vip'],
      searchQuery: 'Sino',
    },
  });

  console.log('[seed] Shared seed state written to out/e2e-seed-state.json');
};

seed().catch(error => {
  console.error(error);
  process.exit(1);
});
