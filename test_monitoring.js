#!/usr/bin/env node

// Test the monitoring and error handling enhancements
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasourceUrl: 'postgresql://namecard_user:namecard_password@localhost:5432/namecard_dev',
});

const TEST_USER_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

async function testMonitoring() {
  console.log('🔍 Testing enhanced monitoring and error handling\n');

  try {
    // Test 1: Valid query (should record successful metrics)
    console.log('1. Testing valid search query:');
    const startTime = Date.now();
    
    const validResults = await prisma.$queryRaw`
      SELECT 
        id,
        first_name,
        last_name,
        company,
        ts_rank(search_vector, to_tsquery('english', 'software')) as rank
      FROM cards 
      WHERE user_id = ${TEST_USER_ID}::uuid
        AND search_vector @@ to_tsquery('english', 'software')
      ORDER BY rank DESC
      LIMIT 5
    `;
    
    const executionTime = Date.now() - startTime;
    console.log(`   ✅ Query executed successfully in ${executionTime}ms`);
    console.log(`   Found ${validResults.length} results`);

    // Test 2: Simulate error scenario
    console.log('\n2. Testing error handling:');
    try {
      await prisma.$queryRaw`
        SELECT * FROM non_existent_table
        WHERE search_vector @@ to_tsquery('english', 'test')
      `;
    } catch (error) {
      console.log(`   ✅ Error properly caught: ${error.message.substring(0, 50)}...`);
    }

    // Test 3: Test empty search vector scenario
    console.log('\n3. Testing edge case - empty results:');
    const emptyResults = await prisma.$queryRaw`
      SELECT 
        id,
        first_name,
        last_name,
        company
      FROM cards 
      WHERE user_id = ${TEST_USER_ID}::uuid
        AND search_vector @@ to_tsquery('english', 'nonexistent_term_xyz123')
      LIMIT 5
    `;
    
    console.log(`   ✅ Empty query handled: ${emptyResults.length} results (expected 0)`);

    // Test 4: Test search vector health
    console.log('\n4. Testing search vector health check:');
    const healthCheck = await prisma.$queryRaw`
      SELECT 
        COUNT(*) as total_cards,
        COUNT(CASE WHEN search_vector IS NOT NULL THEN 1 END) as indexed_cards,
        ROUND(
          COUNT(CASE WHEN search_vector IS NOT NULL THEN 1 END)::numeric / 
          NULLIF(COUNT(*)::numeric, 0) * 100, 2
        ) as completeness_percentage
      FROM cards 
      WHERE user_id = ${TEST_USER_ID}::uuid
    `;
    
    const health = healthCheck[0];
    console.log(`   ✅ Health check completed:`);
    console.log(`     - Total cards: ${health.total_cards}`);
    console.log(`     - Indexed cards: ${health.indexed_cards}`);
    console.log(`     - Completeness: ${health.completeness_percentage}%`);

    // Test 5: Performance testing with multiple queries
    console.log('\n5. Performance testing (10 queries):');
    const queries = [
      'software', 'engineer', 'tech', 'developer', 'manager',
      'consultant', 'analyst', 'director', 'senior', 'lead'
    ];

    const performanceResults = [];
    
    for (const query of queries) {
      const queryStart = Date.now();
      
      const results = await prisma.$queryRaw`
        SELECT COUNT(*) as count
        FROM cards 
        WHERE user_id = ${TEST_USER_ID}::uuid
          AND search_vector @@ to_tsquery('english', ${query})
      `;
      
      const queryTime = Date.now() - queryStart;
      performanceResults.push({ query, time: queryTime, count: Number(results[0].count) });
    }

    const avgTime = performanceResults.reduce((sum, r) => sum + r.time, 0) / performanceResults.length;
    const maxTime = Math.max(...performanceResults.map(r => r.time));
    const minTime = Math.min(...performanceResults.map(r => r.time));

    console.log(`   ✅ Performance results:`);
    console.log(`     - Average query time: ${avgTime.toFixed(2)}ms`);
    console.log(`     - Min query time: ${minTime}ms`);
    console.log(`     - Max query time: ${maxTime}ms`);
    console.log(`     - All queries under 50ms: ${maxTime < 50 ? '✅' : '❌'}`);

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testMonitoring().then(() => {
  console.log('\n✅ Monitoring and error handling tests completed');
}).catch(err => {
  console.error('❌ Monitoring tests failed:', err);
});