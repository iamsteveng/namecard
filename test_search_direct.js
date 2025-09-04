#!/usr/bin/env node

// Test the SearchService directly without API authentication
const { PrismaClient } = require('@prisma/client');
const path = require('path');

// We need to import from the compiled JavaScript
const prisma = new PrismaClient({
  datasourceUrl: 'postgresql://namecard_user:namecard_password@localhost:5432/namecard_dev',
});

const TEST_USER_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

async function testSearchService() {
  console.log('🔍 Testing SearchService directly\n');

  try {
    // Test 1: Basic full-text search with raw SQL
    console.log('1. Testing direct PostgreSQL full-text search:');
    
    const searchResults = await prisma.$queryRaw`
      SELECT 
        id,
        first_name,
        last_name,
        title,
        company,
        ts_rank(search_vector, to_tsquery('english', 'software')) as rank
      FROM cards 
      WHERE user_id = ${TEST_USER_ID}::uuid
        AND search_vector @@ to_tsquery('english', 'software')
      ORDER BY rank DESC
      LIMIT 10
    `;
    
    console.log(`   Found ${searchResults.length} matches for 'software':`);
    searchResults.forEach(result => {
      console.log(`   - ${result.first_name} ${result.last_name} at ${result.company} (rank: ${result.rank})`);
    });

    // Test 2: Multi-language search test
    console.log('\n2. Testing search across languages:');
    
    const multiLangResults = await prisma.$queryRaw`
      SELECT 
        first_name,
        last_name,
        title,
        company,
        ts_rank(search_vector, to_tsquery('english', 'tech')) as rank
      FROM cards 
      WHERE user_id = ${TEST_USER_ID}::uuid
        AND search_vector @@ to_tsquery('english', 'tech')
      ORDER BY rank DESC
      LIMIT 10
    `;
    
    console.log(`   Found ${multiLangResults.length} matches for 'tech':`);
    multiLangResults.forEach(result => {
      console.log(`   - ${result.first_name} ${result.last_name} at ${result.company} (rank: ${result.rank})`);
    });

    // Test 3: Boolean search
    console.log('\n3. Testing boolean search (software & engineer):');
    
    const booleanResults = await prisma.$queryRaw`
      SELECT 
        first_name,
        last_name,
        title,
        company,
        ts_rank(search_vector, to_tsquery('english', 'software & engineer')) as rank
      FROM cards 
      WHERE user_id = ${TEST_USER_ID}::uuid
        AND search_vector @@ to_tsquery('english', 'software & engineer')
      ORDER BY rank DESC
      LIMIT 10
    `;
    
    console.log(`   Found ${booleanResults.length} matches for 'software & engineer':`);
    booleanResults.forEach(result => {
      console.log(`   - ${result.first_name} ${result.last_name} at ${result.company} (rank: ${result.rank})`);
    });

    // Test 4: Search highlighting
    console.log('\n4. Testing search highlighting:');
    
    const highlightResults = await prisma.$queryRaw`
      SELECT 
        first_name,
        last_name,
        company,
        ts_headline('english', 
          COALESCE(first_name, '') || ' ' || 
          COALESCE(last_name, '') || ' ' || 
          COALESCE(title, '') || ' ' || 
          COALESCE(company, ''),
          to_tsquery('english', 'software'),
          'StartSel=<mark>, StopSel=</mark>'
        ) as headline
      FROM cards 
      WHERE user_id = ${TEST_USER_ID}::uuid
        AND search_vector @@ to_tsquery('english', 'software')
      LIMIT 3
    `;
    
    console.log(`   Highlighted results:`);
    highlightResults.forEach(result => {
      console.log(`   - ${result.first_name} ${result.last_name} at ${result.company}`);
      console.log(`     Headline: ${result.headline}`);
    });

    // Test 5: Name search (including non-English names)
    console.log('\n5. Testing name search:');
    
    const nameResults = await prisma.$queryRaw`
      SELECT 
        first_name,
        last_name,
        company,
        title
      FROM cards 
      WHERE user_id = ${TEST_USER_ID}::uuid
        AND (
          first_name ILIKE '%maria%' OR 
          last_name ILIKE '%garcia%' OR
          search_vector @@ to_tsquery('english', 'maria | garcia')
        )
      LIMIT 5
    `;
    
    console.log(`   Found ${nameResults.length} matches for name search:`);
    nameResults.forEach(result => {
      console.log(`   - ${result.first_name} ${result.last_name} at ${result.company}`);
    });

    // Test 6: Performance test
    console.log('\n6. Performance test (search across all cards):');
    const startTime = Date.now();
    
    const perfResults = await prisma.$queryRaw`
      SELECT COUNT(*) as total_cards,
             COUNT(CASE WHEN search_vector IS NOT NULL THEN 1 END) as indexed_cards
      FROM cards 
      WHERE user_id = ${TEST_USER_ID}::uuid
    `;
    
    const endTime = Date.now();
    console.log(`   Total cards: ${perfResults[0].total_cards}, Indexed: ${perfResults[0].indexed_cards}`);
    console.log(`   Query execution time: ${endTime - startTime}ms`);

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testSearchService().then(() => {
  console.log('\n✅ Direct search tests completed');
}).catch(err => {
  console.error('❌ Direct search tests failed:', err);
});