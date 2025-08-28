#!/usr/bin/env tsx
/**
 * Manual testing script for Redis Search functionality
 *
 * Usage:
 *   npx tsx src/scripts/test-search.ts
 *
 * This script tests the Redis Search implementation by:
 * 1. Connecting to Redis and verifying Search module
 * 2. Creating test data and indexing it
 * 3. Performing various search operations
 * 4. Testing performance and response times
 * 5. Cleaning up test data
 */

import type { CardSearchDocument, CompanySearchDocument } from '@namecard/shared';

import redisConfig from '../config/redis.config.js';
import { searchService } from '../services/search.service.js';

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  duration: number;
  error?: string;
  details?: any;
}

class SearchTester {
  private results: TestResult[] = [];
  private testDataIds: string[] = [];

  private async runTest(name: string, testFn: () => Promise<any>): Promise<TestResult> {
    const startTime = Date.now();
    console.log(`\n🧪 ${name}`);

    try {
      const result = await testFn();
      const duration = Date.now() - startTime;
      const testResult: TestResult = {
        name,
        status: 'PASS',
        duration,
        details: result,
      };

      console.log(`✅ PASS (${duration}ms)`);
      this.results.push(testResult);
      return testResult;
    } catch (error) {
      const duration = Date.now() - startTime;
      const testResult: TestResult = {
        name,
        status: 'FAIL',
        duration,
        error: error instanceof Error ? error.message : String(error),
      };

      console.log(`❌ FAIL (${duration}ms): ${testResult.error}`);
      this.results.push(testResult);
      return testResult;
    }
  }

  private createSampleCardData(): CardSearchDocument[] {
    return [
      {
        id: 'test-card-1',
        type: 'card',
        title: 'John Doe - Software Engineer',
        content:
          'John Doe Software Engineer Tech Corp john.doe@techcorp.com +1-555-0101 San Francisco, CA',
        metadata: {
          userId: 'test-user-1',
          companyName: 'Tech Corp',
          personName: 'John Doe',
          email: 'john.doe@techcorp.com',
          phone: '+1-555-0101',
          website: 'https://johndoe.dev',
          address: 'San Francisco, CA',
          jobTitle: 'Software Engineer',
          tags: ['software', 'engineering', 'javascript'],
          enriched: true,
        },
        createdAt: new Date('2024-01-15'),
        updatedAt: new Date('2024-01-15'),
      },
      {
        id: 'test-card-2',
        type: 'card',
        title: 'Jane Smith - Product Manager',
        content:
          'Jane Smith Product Manager InnovateCorp jane.smith@innovate.com +1-555-0102 Austin, TX',
        metadata: {
          userId: 'test-user-1',
          companyName: 'InnovateCorp',
          personName: 'Jane Smith',
          email: 'jane.smith@innovate.com',
          phone: '+1-555-0102',
          jobTitle: 'Product Manager',
          tags: ['product', 'management', 'strategy'],
          enriched: false,
        },
        createdAt: new Date('2024-01-10'),
        updatedAt: new Date('2024-01-10'),
      },
      {
        id: 'test-card-3',
        type: 'card',
        title: 'Mike Johnson - Data Scientist',
        content:
          'Mike Johnson Data Scientist Tech Corp mike.johnson@techcorp.com +1-555-0103 Seattle, WA',
        metadata: {
          userId: 'test-user-2',
          companyName: 'Tech Corp',
          personName: 'Mike Johnson',
          email: 'mike.johnson@techcorp.com',
          phone: '+1-555-0103',
          jobTitle: 'Data Scientist',
          tags: ['data', 'science', 'python', 'machine-learning'],
          enriched: true,
        },
        createdAt: new Date('2024-01-20'),
        updatedAt: new Date('2024-01-20'),
      },
    ];
  }

  private createSampleCompanyData(): CompanySearchDocument[] {
    return [
      {
        id: 'test-company-1',
        type: 'company',
        title: 'Tech Corp',
        content:
          'Tech Corp Leading software development company specializing in enterprise solutions',
        metadata: {
          domain: 'techcorp.com',
          industry: 'Software Development',
          size: 'Large',
          description: 'Leading software development company specializing in enterprise solutions',
          location: 'San Francisco, CA',
          founded: 2015,
          tags: ['software', 'enterprise', 'saas'],
        },
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
      {
        id: 'test-company-2',
        type: 'company',
        title: 'InnovateCorp',
        content: 'InnovateCorp Innovation-focused startup building next-generation products',
        metadata: {
          domain: 'innovate.com',
          industry: 'Technology',
          size: 'Medium',
          description: 'Innovation-focused startup building next-generation products',
          location: 'Austin, TX',
          founded: 2020,
          tags: ['startup', 'innovation', 'product'],
        },
        createdAt: new Date('2024-01-05'),
        updatedAt: new Date('2024-01-05'),
      },
    ];
  }

  async testRedisConnection(): Promise<any> {
    const client = await redisConfig.getClient();
    const pingResult = await client.ping();

    if (pingResult !== 'PONG') {
      throw new Error(`Unexpected ping response: ${pingResult}`);
    }

    // Test Redis Search module availability
    try {
      await client.ft.info('nonexistent-index');
    } catch (error: any) {
      if (!error.message.includes('Unknown index name')) {
        throw new Error(`Redis Search module not available: ${error.message}`);
      }
    }

    return { ping: pingResult, searchModule: 'available' };
  }

  async testSearchServiceInitialization(): Promise<any> {
    await searchService.initialize();
    const health = await searchService.healthCheck();

    if (health.status !== 'healthy') {
      throw new Error(`Search service unhealthy: ${JSON.stringify(health.details)}`);
    }

    return health;
  }

  async testIndexCreation(): Promise<any> {
    // Get index info to verify they were created
    const cardIndexInfo = await searchService.getIndexInfo('idx:cards');
    const companyIndexInfo = await searchService.getIndexInfo('idx:companies');

    return {
      cardIndex: cardIndexInfo,
      companyIndex: companyIndexInfo,
    };
  }

  async testDocumentIndexing(): Promise<any> {
    const cardData = this.createSampleCardData();
    const companyData = this.createSampleCompanyData();

    // Track test data for cleanup
    this.testDataIds.push(...cardData.map(c => c.id));
    this.testDataIds.push(...companyData.map(c => c.id));

    // Index the test documents
    await searchService.indexDocuments([...cardData, ...companyData]);

    // Wait a moment for indexing to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    return {
      cardsIndexed: cardData.length,
      companiesIndexed: companyData.length,
    };
  }

  async testBasicSearch(): Promise<any> {
    const searchResults = await searchService.search(
      {
        q: 'john doe',
        limit: 10,
        offset: 0,
      },
      'idx:cards'
    );

    if (searchResults.results.length === 0) {
      throw new Error('No search results found for "john doe"');
    }

    const johnDoeCard = searchResults.results.find(
      r => r.document.metadata?.personName === 'John Doe'
    );

    if (!johnDoeCard) {
      throw new Error('John Doe card not found in search results');
    }

    return {
      totalResults: searchResults.total,
      resultsReturned: searchResults.results.length,
      queryTime: searchResults.took,
      foundJohnDoe: !!johnDoeCard,
    };
  }

  async testAdvancedSearch(): Promise<any> {
    // Test search with filters
    const filteredResults = await searchService.search(
      {
        q: 'tech corp',
        filters: [
          { field: 'metadata.companyName', value: 'Tech Corp' },
          { field: 'metadata.enriched', value: true },
        ],
        limit: 5,
      },
      'idx:cards'
    );

    // Test search with field restrictions
    const fieldRestrictedResults = await searchService.search(
      {
        q: 'software',
        fields: ['content', 'metadata.jobTitle'],
        limit: 5,
      },
      'idx:cards'
    );

    // Test search with highlighting
    const highlightedResults = await searchService.search(
      {
        q: 'software engineer',
        highlight: {
          fields: ['title', 'content'],
          tags: { pre: '<em>', post: '</em>' },
        },
        limit: 3,
      },
      'idx:cards'
    );

    return {
      filteredCount: filteredResults.total,
      fieldRestrictedCount: fieldRestrictedResults.total,
      highlightedCount: highlightedResults.total,
      hasHighlights: highlightedResults.results.some(r => r.highlights),
    };
  }

  async testCompanySearch(): Promise<any> {
    const companyResults = await searchService.search(
      {
        q: 'software development',
        limit: 5,
      },
      'idx:companies'
    );

    const techCorpResult = companyResults.results.find(
      r => r.document.metadata?.domain === 'techcorp.com'
    );

    return {
      totalCompanies: companyResults.total,
      foundTechCorp: !!techCorpResult,
      queryTime: companyResults.took,
    };
  }

  async testPerformance(): Promise<any> {
    const queries = [
      'john',
      'software engineer',
      'tech corp',
      'data scientist python',
      'product manager strategy',
    ];

    const performanceResults = [];

    for (const query of queries) {
      const startTime = Date.now();
      const results = await searchService.search({ q: query, limit: 10 }, 'idx:cards');
      const duration = Date.now() - startTime;

      performanceResults.push({
        query,
        duration,
        resultCount: results.total,
        searchTime: results.took,
      });

      // Check if under 100ms requirement
      if (duration > 100) {
        console.warn(`⚠️  Query "${query}" took ${duration}ms (>100ms threshold)`);
      }
    }

    const avgDuration =
      performanceResults.reduce((sum, r) => sum + r.duration, 0) / performanceResults.length;
    const maxDuration = Math.max(...performanceResults.map(r => r.duration));
    const under100ms = performanceResults.filter(r => r.duration <= 100).length;

    return {
      queriesTested: queries.length,
      averageDuration: Math.round(avgDuration),
      maxDuration,
      queriesUnder100ms: under100ms,
      percentageUnder100ms: Math.round((under100ms / queries.length) * 100),
      results: performanceResults,
    };
  }

  async testDocumentRemoval(): Promise<any> {
    // Remove one test document
    const cardToRemove = 'test-card-1';
    await searchService.removeDocument(cardToRemove, 'idx:cards');

    // Wait for removal to take effect
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify it's gone
    const searchResults = await searchService.search(
      {
        q: 'john doe',
        limit: 10,
      },
      'idx:cards'
    );

    const johnDoeFound = searchResults.results.find(r => r.document.id === cardToRemove);

    return {
      removedDocument: cardToRemove,
      stillFound: !!johnDoeFound,
      remainingResults: searchResults.total,
    };
  }

  async cleanupTestData(): Promise<any> {
    const cleanupPromises = [];

    for (const docId of this.testDataIds) {
      if (docId.startsWith('test-card-')) {
        cleanupPromises.push(searchService.removeDocument(docId, 'idx:cards'));
      } else if (docId.startsWith('test-company-')) {
        cleanupPromises.push(searchService.removeDocument(docId, 'idx:companies'));
      }
    }

    await Promise.allSettled(cleanupPromises);

    return {
      documentsRemoved: this.testDataIds.length,
    };
  }

  private printSummary(): void {
    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const skipped = this.results.filter(r => r.status === 'SKIP').length;

    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Tests: ${this.results.length}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⏭️  Skipped: ${skipped}`);
    console.log(`Success Rate: ${Math.round((passed / this.results.length) * 100)}%`);

    if (failed > 0) {
      console.log('\n❌ FAILED TESTS:');
      this.results
        .filter(r => r.status === 'FAIL')
        .forEach(r => {
          console.log(`  • ${r.name}: ${r.error}`);
        });
    }

    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);
    console.log(`\n⏱️  Total Duration: ${totalDuration}ms`);

    // Performance summary
    const perfResult = this.results.find(r => r.name === 'Performance Testing');
    if (perfResult?.details) {
      const details = perfResult.details;
      console.log(`\n⚡ PERFORMANCE SUMMARY:`);
      console.log(`  • Average Query Time: ${details.averageDuration}ms`);
      console.log(`  • Max Query Time: ${details.maxDuration}ms`);
      console.log(
        `  • Queries Under 100ms: ${details.queriesUnder100ms}/${details.queriesTested} (${details.percentageUnder100ms}%)`
      );
    }

    console.log('='.repeat(60));
  }

  async runAllTests(): Promise<void> {
    console.log('🚀 Starting Redis Search Testing Suite');
    console.log('====================================');

    try {
      // Core infrastructure tests
      await this.runTest('Redis Connection', () => this.testRedisConnection());
      await this.runTest('Search Service Initialization', () =>
        this.testSearchServiceInitialization()
      );
      await this.runTest('Index Creation', () => this.testIndexCreation());

      // Functionality tests
      await this.runTest('Document Indexing', () => this.testDocumentIndexing());
      await this.runTest('Basic Search', () => this.testBasicSearch());
      await this.runTest('Advanced Search Features', () => this.testAdvancedSearch());
      await this.runTest('Company Search', () => this.testCompanySearch());
      await this.runTest('Document Removal', () => this.testDocumentRemoval());

      // Performance tests
      await this.runTest('Performance Testing', () => this.testPerformance());
    } finally {
      // Cleanup
      await this.runTest('Cleanup Test Data', () => this.cleanupTestData());
      this.printSummary();
    }
  }
}

// Run the tests if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new SearchTester();
  tester
    .runAllTests()
    .then(() => {
      console.log('\n✨ Testing completed!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Testing failed:', error);
      process.exit(1);
    });
}

export { SearchTester };
