#!/usr/bin/env node
import { setTimeout as delay } from 'node:timers/promises';
import { parseBoolean, runCommand, runCompose } from './lib/ci-utils.mjs';

let postgresTestStarted = false;

async function installDependencies() {
  if (parseBoolean(process.env.CI_QUALITY_SKIP_INSTALL)) {
    return 'skip';
  }

  await runCommand('pnpm', ['install', '--frozen-lockfile']);
}

async function generatePrismaClient() {
  await runCommand('pnpm', ['--filter', '@namecard/shared', 'run', 'prisma:generate']);
}

async function startPostgresTest() {
  await runCompose(['up', '-d', 'postgres_test']);
  postgresTestStarted = true;
}

async function waitForPostgresTest(timeoutMs = 60000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      await runCompose(
        ['exec', '-T', 'postgres_test', 'pg_isready', '-U', 'namecard_user', '-d', 'namecard_test'],
        { stdio: 'ignore' }
      );
      return;
    } catch (error) {
      if (Date.now() - startedAt >= timeoutMs) {
        throw error;
      }
      await delay(2000);
    }
  }
  throw new Error('postgres_test did not become healthy in time');
}

async function verifyDatabaseConnectivity() {
  await runCompose(
    ['exec', '-T', 'postgres_test', 'psql', '-U', 'namecard_user', '-d', 'namecard_test', '-c', 'select 1'],
    { stdio: 'ignore' }
  );
}

async function runCiQuality(databaseUrl) {
  await runCommand('pnpm', ['run', 'ci:quality'], {
    env: {
      DATABASE_URL: databaseUrl,
      DB_HOST: '127.0.0.1',
      DB_PORT: '5433',
      DB_NAME: 'namecard_test',
      DB_USER: 'namecard_user',
      DB_PASSWORD: 'namecard_password',
      DB_SSL: 'false',
    },
  });
}

async function runStep(name, fn) {
  process.stdout.write(`▶️  ${name}... `);
  const result = await fn();
  if (result === 'skip') {
    console.log('skipped');
    return;
  }
  console.log('ok');
}

async function cleanup() {
  if (!postgresTestStarted) {
    return;
  }

  const preserveDocker = parseBoolean(
    process.env.CI_QUALITY_PRESERVE_DOCKER ?? process.env.CI_QUALITY_PRESERVE_POSTGRES
  );

  if (preserveDocker) {
    console.log('ℹ️  Preserving postgres_test container because CI_QUALITY_PRESERVE_DOCKER is set.');
    return;
  }

  process.stdout.write('▶️  Stopping postgres_test container... ');
  try {
    await runCompose(['stop', 'postgres_test']);
    await runCompose(['rm', '-f', 'postgres_test']);
    console.log('ok');
  } catch (error) {
    console.warn(`\n⚠️  Failed to stop postgres_test container: ${error.message}`);
  }
}

async function main() {
  const databaseUrl =
    process.env.CI_QUALITY_DATABASE_URL ??
    process.env.DATABASE_URL ??
    'postgresql://namecard_user:namecard_password@127.0.0.1:5433/namecard_test';

  const steps = [
    { name: 'Installing dependencies', fn: installDependencies },
    { name: 'Generating Prisma client', fn: generatePrismaClient },
    { name: 'Starting postgres_test container', fn: startPostgresTest },
    { name: 'Waiting for postgres_test readiness', fn: waitForPostgresTest },
    { name: 'Verifying postgres_test connectivity', fn: verifyDatabaseConnectivity },
    { name: 'Running pnpm run ci:quality', fn: () => runCiQuality(databaseUrl) },
  ];

  try {
    for (const step of steps) {
      await runStep(step.name, step.fn);
    }

    console.log('\n✅ Local CI quality run completed successfully.');
  } finally {
    await cleanup();
  }
}

main().catch(error => {
  console.error(`\n❌ CI quality bootstrap failed: ${error.message}`);
  process.exit(1);
});
