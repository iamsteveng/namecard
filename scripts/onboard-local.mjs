#!/usr/bin/env node
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { setTimeout as delay } from 'timers/promises';

const repoRoot = path.resolve(new URL('.', import.meta.url).pathname, '..');
let composeCommand = null;

async function runCommand(command, args, options = {}) {
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

  try {
    await runCommand('docker', ['compose', 'version'], { stdio: 'ignore' });
    composeCommand = ['docker', 'compose'];
  } catch {
    await runCommand('docker-compose', ['version'], { stdio: 'ignore' });
    composeCommand = ['docker-compose'];
  }

  return composeCommand;
}

async function runCompose(args, options = {}) {
  const cmd = await ensureComposeCommand();
  return runCommand(cmd[0], [...cmd.slice(1), ...args], options);
}

async function checkPrerequisites() {
  const nodeVersion = process.versions.node;
  const [major] = nodeVersion.split('.').map(Number);
  if (Number.isNaN(major) || major < 18) {
    throw new Error(`Node.js v18 or newer required (detected ${nodeVersion})`);
  }

  await runCommand('pnpm', ['--version'], { stdio: 'ignore' });
  await runCommand('docker', ['--version'], { stdio: 'ignore' });
  await ensureComposeCommand();
}

async function ensureEnvFiles() {
  const rootTemplate = path.resolve(repoRoot, '.env.example');
  const rootTarget = path.resolve(repoRoot, '.env');
  try {
    await fs.access(rootTarget);
  } catch {
    await fs.copyFile(rootTemplate, rootTarget);
  }

  const dockerTemplate = path.resolve(repoRoot, 'services', 'api', '.env.docker.example');
  const dockerTarget = path.resolve(repoRoot, 'services', 'api', '.env');
  await fs.copyFile(dockerTemplate, dockerTarget);

  const apiLocalstack = path.resolve(repoRoot, 'services', 'api', '.env.localstack');
  try {
    await fs.access(apiLocalstack);
  } catch {
    await fs.writeFile(apiLocalstack, '');
  }
}

async function waitForPostgres(timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await runCompose(['exec', '-T', 'postgres', 'pg_isready', '-U', 'namecard_user', '-d', 'namecard_dev'], {
        stdio: 'ignore',
      });
      return;
    } catch {
      await delay(2000);
    }
  }
  throw new Error('PostgreSQL container did not become ready in time');
}

async function runStep(name, fn) {
  process.stdout.write(`▶️  ${name}... `);
  await fn();
  console.log('ok');
}

async function main() {
  const steps = [
    { name: 'Checking prerequisites', fn: checkPrerequisites },
    { name: 'Preparing environment files', fn: ensureEnvFiles },
    { name: 'Installing dependencies', fn: () => runCommand('pnpm', ['install']) },
    { name: 'Starting database container', fn: () => runCommand('pnpm', ['run', 'db:up']) },
    { name: 'Waiting for PostgreSQL', fn: waitForPostgres },
    { name: 'Running database migrations', fn: () => runCommand('pnpm', ['run', 'migrate:local']) },
    {
      name: 'Applying Prisma schema (API workspace)',
      fn: () =>
        runCommand('pnpm', ['--filter', '@namecard/api', 'run', 'db:push'], {
          env: {
            DATABASE_URL:
              process.env.DATABASE_URL ||
              'postgresql://namecard_user:namecard_password@localhost:5432/namecard_dev',
            NODE_ENV: 'development',
          },
        }),
    },
    {
      name: 'Seeding baseline data',
      fn: () =>
        runCommand('pnpm', ['run', 'db:seed'], {
          env: {
            DATABASE_URL:
              'postgresql://namecard_user:namecard_password@localhost:5432/namecard_dev',
            NODE_ENV: 'development',
            TEST_USER_ID: process.env.TEST_USER_ID || 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
          },
        }),
    },
    {
      name: 'Ensuring dev bypass user',
      fn: () =>
        runCommand('pnpm', ['--filter', '@namecard/api', 'exec', 'tsx', 'src/scripts/ensure-dev-user.ts'], {
          env: {
            DATABASE_URL:
              process.env.DATABASE_URL ||
              'postgresql://namecard_user:namecard_password@localhost:5432/namecard_dev',
            NODE_ENV: 'development',
            TEST_USER_ID: process.env.TEST_USER_ID || 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
          },
        }),
    },
    { name: 'Booting local stack', fn: () => runCommand('pnpm', ['run', 'fullstack:up']) },
    { name: 'Running smoke verification', fn: () => runCommand('pnpm', ['run', 'smoke:local']) },
  ];

  for (const step of steps) {
    await runStep(step.name, step.fn);
  }

  console.log('\n✅ Local development environment is ready!');
  console.log('   - API:      (retired Express server — invoke Lambda handlers directly)');
  console.log('   - Frontend: http://localhost:8080');
  console.log('   - LocalStack console: http://localhost:4566');
}

main().catch(error => {
  console.error(`\n❌ Onboarding failed: ${error.message}`);
  process.exit(1);
});
