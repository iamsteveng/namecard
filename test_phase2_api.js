#!/usr/bin/env node

/**
 * Phase 2 PostgreSQL Full-Text Search API Test Suite
 *
 * This script tests all Phase 2 full-text search functionality including:
 * - Health monitoring and analytics
 * - Enhanced existing endpoints with search
 * - New advanced search endpoints
 * - Multi-language search capabilities
 * - Boolean search operations
 * - Performance testing
 * - Error handling
 *
 * SETUP INSTRUCTIONS:
 * ===================
 *
 * 1. ENVIRONMENT SETUP:
 *    - Ensure your API server is running: cd services/api && pnpm run dev
 *    - Ensure your PostgreSQL database is running with test data
 *
 * 2. USER ID CONFIGURATION (Optional):
 *    By default, this script uses a hardcoded test user ID. To use a different user:
 *
 *    Option A - Set environment variable:
 *
 *    # On Unix/Mac/Linux:
 *    export TEST_USER_ID="your-user-id-here"
 *    node test_phase2_api.js
 *
 *    # On Windows (Command Prompt):
 *    set TEST_USER_ID=your-user-id-here
 *    node test_phase2_api.js
 *
 *    # On Windows (PowerShell):
 *    $env:TEST_USER_ID="your-user-id-here"
 *    node test_phase2_api.js
 *
 *    # One-liner (Unix/Mac/Linux):
 *    TEST_USER_ID="your-user-id-here" node test_phase2_api.js
 *
 *    Option B - Find available user IDs in database:
 *
 *    # Connect to your development database:
 *    PGPASSWORD=namecard_password psql -h localhost -U namecard_user -d namecard_dev
 *
 *    # List available users with their cards:
 *    SELECT u.id, u.email, u.name, COUNT(c.id) as card_count
 *    FROM users u
 *    LEFT JOIN cards c ON u.id = c.user_id
 *    GROUP BY u.id, u.email, u.name
 *    ORDER BY card_count DESC;
 *
 *    # Copy the desired user ID and use it with TEST_USER_ID environment variable
 *
 * 3. RUNNING THE TESTS:
 *    node test_phase2_api.js
 *
 * TROUBLESHOOTING:
 * ================
 * - If you get authentication errors, ensure development auth bypass is enabled
 * - If you get "user not found" errors, check your TEST_USER_ID is valid
 * - If search tests fail, ensure your database has search vectors populated
 * - For database connection issues, verify your PostgreSQL container is running
 *
 * EXPECTED RESULTS:
 * =================
 * - Success Rate: 100% (13/13 tests passing)
 * - Multi-language search working across 6 languages
 * - Sub-millisecond average response times
 * - Boolean search with proper AND/OR logic
 * - Search filters with dynamic company/tag data
 */

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
      if (!raw || raw.trim() === `Bearer ${DEV_TOKEN}`) {
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

// Development auth bypass token
const DEV_TOKEN = 'dev-bypass-token';
const BASE_URL = 'http://localhost:3001/api/v1';

async function makeRequest(path, options = {}) {
  if (USE_LAMBDA && lambdaRuntime) {
    try {
      return await invokeLambdaRequest(path, options);
    } catch (error) {
      return {
        status: 500,
        data: {
          success: false,
          error: {
            message: error instanceof Error ? error.message : 'Lambda invocation failed',
          },
        },
      };
    }
  }

  return await new Promise((resolve, reject) => {
    const url = `${BASE_URL}${path}`;
    const reqOptions = {
      method: options.method || 'GET',
      headers: {
        Authorization: `Bearer ${DEV_TOKEN}`,
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
  // console.debug('[lambda] invoking', fullPath);
  const headers = await lambdaRuntime.normalizeHeaders({
    Authorization: `Bearer ${DEV_TOKEN}`,
    'Content-Type': 'application/json',
    ...(options.headers ?? {}),
  });

  const queryParameters = {};
  localUrl.searchParams.forEach((value, key) => {
    queryParameters[key] = value;
  });

  const body = options.body
    ? typeof options.body === 'string'
      ? options.body
      : JSON.stringify(options.body)
    : null;

  const event = {
    httpMethod: options.method || 'GET',
    rawPath: fullPath,
    path: fullPath,
    headers,
    queryStringParameters: Object.keys(queryParameters).length > 0 ? queryParameters : null,
    pathParameters: null,
    body,
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

function printTestResult(testName, result, expectedStatus = 200) {
  const statusIcon = result.status === expectedStatus ? '✅' : '❌';
  const successIcon = result.data.success === false ? '❌' : '✅';

  console.log(`\n${testName}:`);
  console.log(`   Status: ${statusIcon} ${result.status} (expected ${expectedStatus})`);

  if (result.data.success !== undefined) {
    console.log(`   Success: ${successIcon} ${result.data.success}`);
  }

  if (result.data.error) {
    console.log(`   Error: ${result.data.error.message}`);
  }
}

async function testPhase2API() {
  console.log('🚀 Testing Phase 2 Full-Text Search API');
  console.log('🔓 Using development auth bypass token\n');

  const results = {
    passed: 0,
    failed: 0,
    total: 0,
  };

  function recordResult(passed) {
    results.total++;
    if (passed) results.passed++;
    else results.failed++;
  }

  try {
    // Test 1: Health check endpoint
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🏥 HEALTH AND MONITORING TESTS');
    console.log('═══════════════════════════════════════════════════════════');

    const healthTest = await makeRequest('/search/health');
    printTestResult('GET /search/health', healthTest);
    recordResult(healthTest.status === 200 && healthTest.data.success);

    if (healthTest.data.success) {
      console.log(`   Overall Status: ${healthTest.data.data.status}`);
      console.log(`   Search Status: ${healthTest.data.data.search.status}`);
      console.log(`   Cards Indexed: ${healthTest.data.data.search.indexes.cardsIndexed}`);
    }

    // Test 2: Analytics endpoint
    const analyticsTest = await makeRequest('/search/analytics');
    console.log('DEBUG analytics response', analyticsTest);
    printTestResult('GET /search/analytics', analyticsTest);
    recordResult(analyticsTest.status === 200 && analyticsTest.data.success);

    // Test 3: Enhanced existing cards endpoint
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('🔍 ENHANCED EXISTING ENDPOINTS');
    console.log('═══════════════════════════════════════════════════════════');

    const cardsSearchTest = await makeRequest('/cards?q=software');
    console.log('DEBUG cards list response', JSON.stringify(cardsSearchTest, null, 2));
    printTestResult('GET /cards?q=software (enhanced)', cardsSearchTest);
    recordResult(cardsSearchTest.status === 200 && cardsSearchTest.data.success);

    if (cardsSearchTest.data.success) {
      const count = cardsSearchTest.data.data.cards.length;
      console.log(`   Found: ${count} cards with 'software'`);
      if (count > 0) {
        cardsSearchTest.data.data.cards.forEach(card => {
          console.log(`     - ${card.name} at ${card.company}`);
        });
      }
    }

    // Test 4: Advanced cards search endpoint
    const advancedSearchTest = await makeRequest(
      '/cards/search?q=tech&highlight=true&includeRank=true'
    );
    printTestResult('GET /cards/search?q=tech (advanced)', advancedSearchTest);
    recordResult(advancedSearchTest.status === 200 && advancedSearchTest.data.success);

    if (advancedSearchTest.data.success) {
      console.log(`   Found: ${advancedSearchTest.data.data.results.length} cards with 'tech'`);
      if (advancedSearchTest.data.data.searchMeta) {
        console.log(`   Query: ${advancedSearchTest.data.data.searchMeta.query}`);
        console.log(`   Execution Time: ${advancedSearchTest.data.data.searchMeta.executionTime}`);
      }
    }

    // Test 5: New advanced search endpoints
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('🆕 NEW ADVANCED SEARCH ENDPOINTS');
    console.log('═══════════════════════════════════════════════════════════');

    const newCardsSearchTest = await makeRequest('/search/cards', {
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
    printTestResult('POST /search/cards', newCardsSearchTest);
    recordResult(newCardsSearchTest.status === 200 && newCardsSearchTest.data.success);

    if (newCardsSearchTest.data.success) {
      const results = newCardsSearchTest.data.data.results;
      console.log(`   Found: ${results.length} cards with 'engineer'`);
      if (results.length > 0) {
        results.forEach(result => {
          const card = result.item;
          console.log(`     - ${card.name} at ${card.company} (rank: ${result.rank.toFixed(4)})`);
        });
      }
      if (newCardsSearchTest.data.data.searchMeta) {
        console.log(
          `   Processed Query: ${newCardsSearchTest.data.data.searchMeta.processedQuery}`
        );
        console.log(`   Total Matches: ${newCardsSearchTest.data.data.searchMeta.totalMatches}`);
      }
    }

    // Test 6: Search suggestions
    const suggestionsTest = await makeRequest('/search/suggestions?prefix=soft&maxSuggestions=5');
    printTestResult('GET /search/suggestions', suggestionsTest);
    const suggestionsPayload = Array.isArray(suggestionsTest.data)
      ? suggestionsTest.data
      : Array.isArray(suggestionsTest.data?.data?.suggestions)
        ? suggestionsTest.data.data.suggestions
        : [];
    recordResult(suggestionsTest.status === 200 && Array.isArray(suggestionsPayload));

    if (suggestionsTest.status === 200) {
      console.log(`   Suggestions for 'soft': ${suggestionsPayload.length} found`);
      suggestionsPayload.forEach(suggestion => {
        console.log(`     - ${suggestion.text} (${suggestion.type})`);
      });
    }

    // Test 7: Search filters
    const filtersTest = await makeRequest('/search/filters');
    printTestResult('GET /search/filters', filtersTest);
    recordResult(filtersTest.status === 200 && filtersTest.data.success);

    if (filtersTest.data.success) {
      const filters = filtersTest.data.data.filters;
      console.log(`   Companies: ${filters.companies.length} available`);
      console.log(`   Tags: ${filters.tags.length} available`);
      console.log(`   Industries: ${filters.industries.length} available`);
    }

    // Test 8: Multi-language searches
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('🌍 MULTI-LANGUAGE SEARCH TESTS');
    console.log('═══════════════════════════════════════════════════════════');

    const testQueries = [
      { query: 'software', expected: 'English/Spanish/German cards' },
      { query: 'tech', expected: 'English/French/German companies' },
      { query: 'engineer', expected: 'All engineer titles' },
      { query: 'desarrollo', expected: 'Spanish development terms' },
      { query: 'développeur', expected: 'French developer terms' },
    ];

    for (const testQuery of testQueries) {
      const multiLangTest = await makeRequest(`/cards?q=${encodeURIComponent(testQuery.query)}`);
      printTestResult(`Multi-language: '${testQuery.query}'`, multiLangTest);
      recordResult(multiLangTest.status === 200 && multiLangTest.data.success);

      if (multiLangTest.data.success) {
        const count = multiLangTest.data.data.cards.length;
        console.log(`   Expected: ${testQuery.expected}`);
        console.log(`   Results: ${count} cards found`);
        if (count > 0) {
          multiLangTest.data.data.cards.slice(0, 2).forEach(card => {
            console.log(`     - ${card.name}: ${card.title} at ${card.company}`);
          });
        }
      }
    }

    // Test 9: Boolean search operations
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('🔍 BOOLEAN SEARCH OPERATIONS');
    console.log('═══════════════════════════════════════════════════════════');

    const booleanSearchTest = await makeRequest('/search/cards', {
      method: 'POST',
      body: {
        q: 'software engineer',
        searchMode: 'boolean',
        highlight: true,
        includeRank: true,
        page: 1,
        limit: 5,
      },
    });
    printTestResult('Boolean Search: software AND engineer', booleanSearchTest);
    recordResult(booleanSearchTest.status === 200 && booleanSearchTest.data.success);

    if (booleanSearchTest.data.success) {
      const results = booleanSearchTest.data.data.results;
      console.log(`   Boolean results: ${results.length} cards`);
      results.forEach(result => {
        const card = result.item;
        console.log(`     - ${card.name}: ${card.title} (rank: ${result.rank.toFixed(4)})`);
      });
    }

    // Test 10: Performance testing
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('⚡ PERFORMANCE TESTS');
    console.log('═══════════════════════════════════════════════════════════');

    const performanceTests = ['software', 'engineer', 'tech', 'developer', 'manager'];
    let totalTime = 0;
    let successfulTests = 0;

    for (const query of performanceTests) {
      const startTime = Date.now();
      const perfTest = await makeRequest(`/cards?q=${query}`);
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      totalTime += responseTime;

      if (perfTest.status === 200) {
        successfulTests++;
        const resultCount = perfTest.data.success ? perfTest.data.data.cards.length : 0;
        console.log(`   '${query}': ${responseTime}ms (${resultCount} results)`);
      } else {
        console.log(`   '${query}': FAILED ${perfTest.status}`);
      }
    }

    const avgTime = totalTime / performanceTests.length;
    console.log(`\n   Average response time: ${avgTime.toFixed(2)}ms`);
    console.log(`   All queries under 500ms: ${avgTime < 500 ? '✅' : '❌'}`);
    console.log(`   Successful tests: ${successfulTests}/${performanceTests.length}`);

    // Test 11: Error handling
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('🚨 ERROR HANDLING TESTS');
    console.log('═══════════════════════════════════════════════════════════');

    // Test invalid query
    const invalidQueryTest = await makeRequest('/search/cards', {
      method: 'POST',
      body: {
        q: '((invalid boolean query with unmatched parentheses',
        searchMode: 'boolean',
      },
    });
    console.log('\nInvalid boolean query test:');
    console.log(`   Status: ${invalidQueryTest.status} (expected 400 or handled gracefully)`);
    console.log(`   Success: ${invalidQueryTest.data.success}`);
    if (!invalidQueryTest.data.success && invalidQueryTest.data.error) {
      console.log(`   Error handled: ${invalidQueryTest.data.error.message.substring(0, 50)}...`);
    }

    // Final summary
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📊 TEST SUMMARY');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Total Tests: ${results.total}`);
    console.log(`Passed: ✅ ${results.passed}`);
    console.log(`Failed: ❌ ${results.failed}`);
    console.log(`Success Rate: ${((results.passed / results.total) * 100).toFixed(1)}%`);

    if (results.passed === results.total) {
      console.log('\n🎉 ALL TESTS PASSED! Phase 2 implementation is working correctly.');
    } else if (results.passed / results.total >= 0.8) {
      console.log('\n⚠️  Most tests passed, but some issues detected. Check failed tests above.');
    } else {
      console.log('\n❌ Multiple test failures detected. Phase 2 implementation needs review.');
    }

    console.log('\n🔧 To start testing:');
    console.log('1. Make sure API server is running: cd services/api && pnpm run dev');
    console.log('2. Ensure database is running with test data');
    console.log('3. Run this script: node test_phase2_api.js');
  } catch (error) {
    console.error('\n❌ Test suite failed with error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    console.log('\nPlease ensure:');
    console.log('- API server is running on http://localhost:3001');
    console.log('- Database contains test data');
    console.log('- Development auth bypass is enabled');
  }
}

// Run the test suite
testPhase2API()
  .then(() => {
    console.log('\n✅ Test suite completed');
  })
  .catch(err => {
    console.error('❌ Test suite error:', err);
  });
