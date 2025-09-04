#!/usr/bin/env node

// Quick script to create test user with proper schema fields for development
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasourceUrl: 'postgresql://namecard_user:namecard_password@localhost:5432/namecard_dev',
});

const TEST_USER_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

async function createTestUser() {
  try {
    console.log('🔍 Checking for test user...');

    // Check if test user exists using raw SQL to handle schema mismatch
    const existingUser = await prisma.$queryRaw`
      SELECT id, email, first_name, last_name 
      FROM users 
      WHERE id = ${TEST_USER_ID}::uuid
    `;

    if (existingUser && existingUser.length > 0) {
      console.log('✅ Test user already exists:', existingUser[0]);
      return existingUser[0];
    }

    console.log('🆕 Creating test user with proper schema...');

    // Create test user with database's actual schema
    const newUser = await prisma.$executeRaw`
      INSERT INTO users (id, email, first_name, last_name, cognito_user_id, created_at, updated_at)
      VALUES (
        ${TEST_USER_ID}::uuid,
        'test@namecard.app',
        'Test',
        'User', 
        'dev-bypass-cognito-id',
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `;

    console.log('✅ Test user created successfully!');
    
    // Verify creation
    const verifyUser = await prisma.$queryRaw`
      SELECT id, email, first_name, last_name 
      FROM users 
      WHERE id = ${TEST_USER_ID}::uuid
    `;

    console.log('📊 Created user:', verifyUser[0]);
    
    return verifyUser[0];

  } catch (error) {
    console.error('❌ Error creating test user:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  createTestUser()
    .then(() => {
      console.log('\n✅ Test user setup completed!');
      console.log('👤 You can now test the search functionality with the dev bypass');
      console.log('🌐 Open http://localhost:3000 to start testing');
    })
    .catch(error => {
      console.error('\n❌ Setup failed:', error);
      process.exit(1);
    });
}

module.exports = { createTestUser };