#!/usr/bin/env node

const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const USE_LAMBDA = process.env.USE_LAMBDA_HANDLERS === 'true';

let lambdaRuntime = null;

if (USE_LAMBDA) {
  const sharedDist = path.resolve(__dirname, 'services/shared/dist/index.js');
  if (!fs.existsSync(sharedDist)) {
    console.log('ℹ️  Building @namecard/shared for Lambda mode...');
    const buildResult = spawnSync('pnpm', ['--filter', '@namecard/shared', 'run', 'build'], {
      stdio: 'inherit',
    });
    if (buildResult.status !== 0) {
      throw new Error('Failed to build @namecard/shared before running tests');
    }
  }

  const { register } = require('esbuild-register/dist/node');
  const registerResult = register({
    extensions: ['.ts'],
    target: 'es2020',
    tsconfigRaw: require(path.resolve(__dirname, 'tsconfig.json')),
  });
  process.on('exit', () => registerResult.unregister());
  const moduleAlias = require('module-alias');
  moduleAlias.addAlias('@namecard/shared', path.resolve(__dirname, 'services/shared/src/index.ts'));
  moduleAlias.addAlias('@namecard/shared/*', path.resolve(__dirname, 'services/shared/src'));

  const { handler: authHandler } = require(path.resolve(__dirname, 'services/auth/handler.ts'));
  const { handler: cardsHandler } = require(path.resolve(__dirname, 'services/cards/handler.ts'));
  const { handler: searchHandler } = require(path.resolve(__dirname, 'services/search/handler.ts'));
  const { handler: uploadsHandler } = require(
    path.resolve(__dirname, 'services/uploads/handler.ts')
  );
  const { handler: ocrHandler } = require(path.resolve(__dirname, 'services/ocr/handler.ts'));
  const { handler: enrichmentHandler } = require(
    path.resolve(__dirname, 'services/enrichment/handler.ts')
  );
  const { seedDemoWorkspace } = require(
    path.resolve(__dirname, 'services/shared/src/data/seed.ts')
  );

  let seeded = false;
  let cachedAccessToken;

  const loginEvent = () => ({
    httpMethod: 'POST',
    rawPath: '/v1/auth/login',
    path: '/v1/auth/login',
    headers: { 'content-type': 'application/json' },
    queryStringParameters: null,
    pathParameters: null,
    body: JSON.stringify({ email: 'demo@namecard.app', password: 'DemoPass123!' }),
    requestContext: { requestId: 'lambda-login' },
  });

  const fetchAccessToken = async () => {
    if (!seeded) {
      await seedDemoWorkspace({ reset: true });
      seeded = true;
    }
    if (!cachedAccessToken) {
      const response = await authHandler(loginEvent());
      if (response.statusCode !== 200) {
        throw new Error(`Login failed: ${response.statusCode} ${response.body}`);
      }
      const payload = JSON.parse(response.body);
      cachedAccessToken = payload.data.session.accessToken;
    }
    return cachedAccessToken;
  };

  const normalizeHeaders = async headers => {
    const token = await fetchAccessToken();
    const resolvedHeaders = { ...headers };
    const authHeaderKey = Object.keys(resolvedHeaders).find(
      key => key.toLowerCase() === 'authorization'
    );

    if (authHeaderKey) {
      const raw = resolvedHeaders[authHeaderKey];
      if (!raw || raw.trim() === `Bearer ${TEST_TOKEN}`) {
        resolvedHeaders[authHeaderKey] = `Bearer ${token}`;
      }
    } else {
      resolvedHeaders['Authorization'] = `Bearer ${token}`;
    }

    if (!resolvedHeaders['Content-Type'] && !resolvedHeaders['content-type']) {
      resolvedHeaders['Content-Type'] = 'application/json';
    }

    return resolvedHeaders;
  };

  lambdaRuntime = {
    handlers: {
      auth: authHandler,
      cards: cardsHandler,
      search: searchHandler,
      uploads: uploadsHandler,
      ocr: ocrHandler,
      enrichment: enrichmentHandler,
    },
    normalizeHeaders,
  };
}

// Test JWT token for user f47ac10b-58cc-4372-a567-0e02b2c3d479
// This is just for testing - normally this would come from auth service
const TEST_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiZjQ3YWMxMGItNThjYy00MzcyLWE1NjctMGUwMmIyYzNkNDc5IiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiaWF0IjoxNzI1MjAzNjAwLCJleHAiOjE5NDA1NjM2MDB9.mockTokenForTestingPurposes';

const BASE_URL = 'http://localhost:3001/api/v1';

async function makeRequest(pathname, options = {}) {
  if (USE_LAMBDA && lambdaRuntime) {
    return invokeLambdaRequest(pathname, options);
  }

  return await new Promise((resolve, reject) => {
    const url = `${BASE_URL}${path}`;
    const reqOptions = {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    const req = http.request(url, reqOptions, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data, error: e.message });
        }
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

async function invokeLambdaRequest(pathname, options = {}) {
  const localUrl = new URL(pathname, 'http://lambda.local');
  const fullPath = `/api/v1${localUrl.pathname}`;
  const headers = await lambdaRuntime.normalizeHeaders({
    Authorization: `Bearer ${TEST_TOKEN}`,
    'Content-Type': 'application/json',
    ...(options.headers ?? {}),
  });

  const queryParameters = {};
  localUrl.searchParams.forEach((value, key) => {
    queryParameters[key] = value;
  });

  const event = {
    httpMethod: options.method || 'GET',
    rawPath: fullPath,
    path: fullPath,
    headers,
    queryStringParameters: Object.keys(queryParameters).length > 0 ? queryParameters : null,
    pathParameters: null,
    body: options.body ? JSON.stringify(options.body) : null,
    requestContext: { requestId: 'lambda-test-request' },
  };

  const segments = fullPath.split('/').filter(Boolean);
  const domain = segments[2];
  const handler = lambdaRuntime.handlers[domain];

  if (!handler) {
    return {
      status: 500,
      data: {
        success: false,
        error: { message: `No Lambda handler registered for ${fullPath}` },
      },
    };
  }

  const response = await handler(event);

  let payload;
  try {
    payload = JSON.parse(response.body);
  } catch (error) {
    payload = {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Failed to parse Lambda response',
        raw: response.body,
      },
    };
  }

  return {
    status: response.statusCode,
    data: payload,
  };
}

async function testSearchAPI() {
  console.log('🔍 Testing NameCard Search API\n');

  try {
    // Test 1: Basic cards search with 'software' query
    console.log('1. Testing basic cards search with "software":');
    const test1 = await makeRequest('/cards?q=software');
    console.log(`   Status: ${test1.status}`);
    if (test1.data.success) {
      const cards = test1.data.cards ?? test1.data.data?.cards ?? [];
      console.log(`   Results: ${cards.length} cards found`);
      cards.forEach(card => {
        console.log(`   - ${card.first_name} ${card.last_name} at ${card.company}`);
      });
    } else {
      console.log(`   Error: ${test1.data.error?.message || 'Unknown error'}`);
    }

    // Test 2: Advanced search with 'tech' query
    console.log('\n2. Testing advanced search with "tech":');
    const test2 = await makeRequest('/cards/search?q=tech&highlight=true');
    console.log(`   Status: ${test2.status}`);
    if (test2.data.success) {
      const results = test2.data.results ?? test2.data.data?.results ?? [];
      console.log(`   Results: ${results.length} cards found`);
      results.forEach(result => {
        const card = result.item ?? result;
        console.log(
          `   - ${card.first_name ?? card.name} ${card.last_name ?? ''} at ${card.company}`
        );
      });
    } else {
      console.log(`   Error: ${test2.data.error?.message || 'Unknown error'}`);
    }

    // Test 3: New search endpoint with advanced parameters
    console.log('\n3. Testing new search endpoint with POST:');
    const test3 = await makeRequest('/search/cards', {
      method: 'POST',
      body: {
        q: 'engineer',
        searchMode: 'simple',
        highlight: true,
        includeRank: true,
        page: 1,
        limit: 10,
      },
    });
    console.log(`   Status: ${test3.status}`);
    if (test3.data.success) {
      const results = test3.data.results ?? test3.data.data?.results ?? [];
      const searchMeta = test3.data.searchMeta ?? test3.data.data?.searchMeta;
      console.log(`   Results: ${results.length} cards found`);
      console.log(`   Search Meta: ${JSON.stringify(searchMeta)}`);
      results.forEach(result => {
        const card = result.item;
        console.log(
          `   - ${card.first_name} ${card.last_name} at ${card.company} (rank: ${result.rank})`
        );
      });
    } else {
      console.log(`   Error: ${test3.data.error?.message || 'Unknown error'}`);
    }

    // Test 4: Search suggestions
    console.log('\n4. Testing search suggestions:');
    const test4 = await makeRequest('/search/suggestions?prefix=soft');
    console.log(`   Status: ${test4.status}`);
    const suggestions = Array.isArray(test4.data)
      ? test4.data
      : Array.isArray(test4.data?.data?.suggestions)
        ? test4.data.data.suggestions
        : [];
    if (test4.status === 200) {
      console.log(`   Suggestions: ${suggestions.length} found`);
      suggestions.forEach(suggestion => {
        console.log(`   - ${suggestion.text} (${suggestion.type})`);
      });
    } else {
      console.log(`   Error: ${test4.data?.error?.message || 'Unknown error'}`);
    }

    // Test 5: Multi-language search
    console.log('\n5. Testing multi-language search with Chinese characters:');
    const test5 = await makeRequest('/cards?q=' + encodeURIComponent('软件'));
    console.log(`   Status: ${test5.status}`);
    if (test5.data.success) {
      const cards = test5.data.cards ?? test5.data.data?.cards ?? [];
      console.log(`   Results: ${cards.length} cards found`);
      cards.forEach(card => {
        console.log(`   - ${card.first_name} ${card.last_name} at ${card.company}`);
      });
    } else {
      console.log(`   Error: ${test5.data.error?.message || 'Unknown error'}`);
    }

    // Test 6: Search health check
    console.log('\n6. Testing search health:');
    const test6 = await makeRequest('/search/health');
    console.log(`   Status: ${test6.status}`);
    if (test6.data.success) {
      const health = test6.data.data ?? {};
      const status = health.search?.status ?? health.status;
      console.log(`   Health Status: ${status}`);
      console.log(`   Index Health: ${JSON.stringify(health.search, null, 2)}`);
    } else {
      console.log(`   Error: ${test6.data.error?.message || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testSearchAPI()
  .then(() => {
    console.log('\n✅ Search API tests completed');
  })
  .catch(err => {
    console.error('❌ Search API tests failed:', err);
  });
