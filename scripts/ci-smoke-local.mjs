#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let composeCommand = null;
let postgresTestStarted = false;

const truthyValues = new Set(['1', 'true', 'yes', 'on']);

function parseBoolean(value) {
  if (typeof value !== 'string') {
    return false;
  }
  return truthyValues.has(value.trim().toLowerCase());
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: options.cwd || repoRoot,
      stdio: options.stdio || 'inherit',
      env: { ...process.env, ...(options.env || {}) },
    });

    proc.on('error', error => reject(error));
    proc.on('close', code => {
      if (code === 0) {
        resolve(undefined);
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
      }
    });
  });
}

async function ensureComposeCommand() {
  if (composeCommand) {
    return composeCommand;
  }

  let dockerComposeError;
  try {
    await runCommand('docker', ['compose', 'version'], { stdio: 'ignore' });
    composeCommand = ['docker', 'compose'];
    return composeCommand;
  } catch (error) {
    dockerComposeError = error;
  }

  try {
    await runCommand('docker-compose', ['version'], { stdio: 'ignore' });
    composeCommand = ['docker-compose'];
    return composeCommand;
  } catch (error) {
    const contextMessages = [];
    if (dockerComposeError) {
      contextMessages.push(`docker compose check failed: ${dockerComposeError.message}`);
    }
    contextMessages.push(`docker-compose check failed: ${error.message}`);
    contextMessages.push('Docker (with Compose) is required to run the CI smoke suite locally.');
    const diagnostic = contextMessages.join('\n  - ');
    throw new Error(`Unable to locate Docker Compose support.\n  - ${diagnostic}`);
  }
}

async function runCompose(args, options = {}) {
  const cmd = await ensureComposeCommand();
  return runCommand(cmd[0], [...cmd.slice(1), ...args], options);
}

async function installDependencies() {
  await runCommand('pnpm', ['install', '--frozen-lockfile']);
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

async function applyTestMigrations() {
  await runCommand('pnpm', ['run', 'migrate:local'], {
    env: {
      DB_HOST: '127.0.0.1',
      DB_PORT: '5433',
      DB_NAME: 'namecard_test',
      DB_USER: 'namecard_user',
      DB_PASSWORD: 'namecard_password',
      DB_SSL: 'false',
    },
  });
}

async function runSmokeSuite(databaseUrl) {
  await runCommand('pnpm', ['run', 'test:e2e:web'], {
    env: {
      CI: 'true',
      WEB_E2E_AUTOSTART_DEV_SERVER: 'true',
      WEB_E2E_AUTOSTART_API_SANDBOX: 'true',
      WEB_E2E_DATABASE_URL: databaseUrl,
      DATABASE_URL: databaseUrl,
    },
  });
}

async function runStep(name, fn) {
  process.stdout.write(`▶️  ${name}... `);
  await fn();
  console.log('ok');
}

async function cleanup() {
  if (!postgresTestStarted) {
    return;
  }

  const preserveDocker = parseBoolean(
    process.env.CI_SMOKE_PRESERVE_DOCKER ?? process.env.CI_SMOKE_PRESERVE_POSTGRES
  );

  if (preserveDocker) {
    console.log(
      'ℹ️  Preserving postgres_test container because CI_SMOKE_PRESERVE_DOCKER is set.'
    );
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
    process.env.WEB_E2E_DATABASE_URL ??
    process.env.DATABASE_URL ??
    'postgresql://namecard_user:namecard_password@127.0.0.1:5433/namecard_test';

  const steps = [
    { name: 'Installing dependencies', fn: installDependencies },
    { name: 'Starting postgres_test container', fn: startPostgresTest },
    { name: 'Waiting for postgres_test readiness', fn: waitForPostgresTest },
    { name: 'Applying test database migrations', fn: applyTestMigrations },
    { name: 'Running CI smoke suite', fn: () => runSmokeSuite(databaseUrl) },
  ];

  try {
    for (const step of steps) {
      await runStep(step.name, step.fn);
    }

    console.log('\n✅ Local CI smoke run completed successfully.');
  } finally {
    await cleanup();
  }
}

main().catch(error => {
  console.error(`\n❌ CI smoke bootstrap failed: ${error.message}`);
  process.exit(1);
});
