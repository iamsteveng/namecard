process.env.DATABASE_URL ||=
  'postgresql://namecard_user:namecard_password@localhost:5432/namecard_dev';
process.env.PRISMA_LOG_LEVEL ||= 'debug';

import { seedDemoWorkspace, disconnectPrisma } from '../services/shared/src/data';

async function main(): Promise<void> {
  await seedDemoWorkspace({ reset: true });
  await disconnectPrisma();
}

main()
  .then(() => {
    console.log('✅ Database seeded with demo data.');
  })
  .catch(error => {
    console.error('❌ Failed to seed database:', error);
    process.exit(1);
  });
