#!/usr/bin/env node

import {
  describeSeedSummary,
  removeSharedSeedState,
  readSharedSeedState,
  seedStatePath,
} from '@namecard/e2e-shared';

async function main() {
  const existing = await readSharedSeedState();
  if (!existing) {
    console.log('ℹ️  No shared seed file found. Nothing to purge.');
    return;
  }

  console.log(`🧹 Removing shared E2E seed at ${seedStatePath}`);
  console.log(`    Current contents: ${describeSeedSummary(existing)}`);
  await removeSharedSeedState();
  console.log('✅ Shared seed state removed. Subsequent runs will reseed data.');
}

main().catch(error => {
  console.error('❌ Failed to clear shared E2E seed state:', error);
  process.exit(1);
});
