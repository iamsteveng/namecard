#!/usr/bin/env node

const http = require('http');

// Test JWT token for user f47ac10b-58cc-4372-a567-0e02b2c3d479
// This is just for testing - normally this would come from auth service
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiZjQ3YWMxMGItNThjYy00MzcyLWE1NjctMGUwMmIyYzNkNDc5IiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiaWF0IjoxNzI1MjAzNjAwLCJleHAiOjE5NDA1NjM2MDB9.mockTokenForTestingPurposes';

const BASE_URL = 'http://localhost:3001/api/v1';

function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${path}`;
    const reqOptions = {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    };

    const req = http.request(url, reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
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

async function testSearchAPI() {
  console.log('🔍 Testing NameCard Search API\n');

  try {
    // Test 1: Basic cards search with 'software' query
    console.log('1. Testing basic cards search with "software":');
    const test1 = await makeRequest('/cards?q=software');
    console.log(`   Status: ${test1.status}`);
    if (test1.data.success) {
      console.log(`   Results: ${test1.data.data.cards.length} cards found`);
      test1.data.data.cards.forEach(card => {
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
      console.log(`   Results: ${test2.data.data.results.length} cards found`);
      test2.data.data.results.forEach(card => {
        console.log(`   - ${card.first_name} ${card.last_name} at ${card.company}`);
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
        limit: 10
      }
    });
    console.log(`   Status: ${test3.status}`);
    if (test3.data.success) {
      console.log(`   Results: ${test3.data.data.results.length} cards found`);
      console.log(`   Search Meta: ${JSON.stringify(test3.data.data.searchMeta)}`);
      test3.data.data.results.forEach(result => {
        const card = result.item;
        console.log(`   - ${card.first_name} ${card.last_name} at ${card.company} (rank: ${result.rank})`);
      });
    } else {
      console.log(`   Error: ${test3.data.error?.message || 'Unknown error'}`);
    }

    // Test 4: Search suggestions
    console.log('\n4. Testing search suggestions:');
    const test4 = await makeRequest('/search/suggestions?prefix=soft');
    console.log(`   Status: ${test4.status}`);
    if (test4.data.success) {
      console.log(`   Suggestions: ${test4.data.data.suggestions.length} found`);
      test4.data.data.suggestions.forEach(suggestion => {
        console.log(`   - ${suggestion.text} (${suggestion.type})`);
      });
    } else {
      console.log(`   Error: ${test4.data.error?.message || 'Unknown error'}`);
    }

    // Test 5: Multi-language search
    console.log('\n5. Testing multi-language search with Chinese characters:');
    const test5 = await makeRequest('/cards?q=' + encodeURIComponent('软件'));
    console.log(`   Status: ${test5.status}`);
    if (test5.data.success) {
      console.log(`   Results: ${test5.data.data.cards.length} cards found`);
      test5.data.data.cards.forEach(card => {
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
      console.log(`   Health Status: ${test6.data.data.status}`);
      console.log(`   Index Health: ${JSON.stringify(test6.data.data.health, null, 2)}`);
    } else {
      console.log(`   Error: ${test6.data.error?.message || 'Unknown error'}`);
    }

  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testSearchAPI().then(() => {
  console.log('\n✅ Search API tests completed');
}).catch(err => {
  console.error('❌ Search API tests failed:', err);
});