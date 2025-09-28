import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TEST_USER_ID = process.env.TEST_USER_ID || 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

async function ensureDevUser() {
  try {
    console.log('🔍 Checking for dev bypass user...');

    await prisma.$executeRaw`
      INSERT INTO users (id, email, name, cognito_id, preferences, created_at, updated_at)
      VALUES (
        ${TEST_USER_ID}::uuid,
        'test@namecard.app',
        'Test User',
        'dev-bypass-cognito-id',
        '{}'::jsonb,
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO UPDATE
      SET email = EXCLUDED.email,
          name = EXCLUDED.name,
          cognito_id = EXCLUDED.cognito_id,
          preferences = EXCLUDED.preferences,
          updated_at = NOW()
    `;

    const user = await prisma.user.findUnique({
      where: { id: TEST_USER_ID },
      select: { id: true, email: true, name: true },
    });

    console.log('✅ Dev user ready:', user);
  } catch (error) {
    console.error('❌ Failed to ensure dev user:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

ensureDevUser().catch(error => {
  console.error(error);
  process.exit(1);
});
