#!/usr/bin/env node
import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';
import fs from 'fs/promises';
import path from 'path';

const repoRoot = path.resolve(new URL('.', import.meta.url).pathname, '..');
const apiEnvLocalstackPath = path.resolve(repoRoot, 'services', 'api', '.env.localstack');
const apiEnvOverrideDir = path.dirname(apiEnvLocalstackPath);

let composeCommand = null;

async function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: options.cwd || repoRoot,
      stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...(options.env || {}) },
    });

    let stdout = '';
    let stderr = '';

    if (proc.stdout) {
      proc.stdout.on('data', chunk => {
        stdout += chunk.toString();
        if (options.verbose) {
          process.stdout.write(chunk);
        }
      });
    }

    if (proc.stderr) {
      proc.stderr.on('data', chunk => {
        stderr += chunk.toString();
        if (options.verbose) {
          process.stderr.write(chunk);
        }
      });
    }

    proc.on('close', code => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const error = new Error(`Command ${command} ${args.join(' ')} exited with code ${code}`);
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      }
    });
  });
}

async function ensureComposeCommand() {
  if (composeCommand) {
    return composeCommand;
  }

  try {
    await runCommand('docker', ['compose', 'version']);
    composeCommand = ['docker', 'compose'];
  } catch {
    await runCommand('docker-compose', ['version']);
    composeCommand = ['docker-compose'];
  }

  return composeCommand;
}

async function runCompose(args, options = {}) {
  const cmd = await ensureComposeCommand();
  return runCommand(cmd[0], [...cmd.slice(1), ...args], options);
}

async function waitForLocalstack(timeoutMs = 180000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch('http://localhost:4566/_localstack/health');
      if (response.ok) {
        const data = await response.json();
        if (data?.services?.dynamodb === 'running' || data?.services) {
          return;
        }
      }
    } catch (error) {
      // ignore until timeout
    }

    await delay(2000);
  }

  throw new Error('Timed out waiting for LocalStack to become healthy');
}

async function readLocalstackBootstrap(timeoutMs = 180000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const { stdout } = await runCompose(
        ['exec', '-T', 'localstack', 'cat', '/var/lib/localstack/bootstrap-outputs.json'],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      );
      if (stdout) {
        const data = JSON.parse(stdout);
        if (data?.bucket && data?.cognitoUserPoolId && data?.cognitoClientId) {
          return data;
        }
      }
    } catch (error) {
      // Retry until timeout
    }
    await delay(2000);
  }

  throw new Error('Timed out waiting for LocalStack bootstrap outputs');
}

async function writeApiLocalstackEnv(outputs) {
  await fs.mkdir(apiEnvOverrideDir, { recursive: true });

  const overrides = {
    USE_LOCALSTACK: 'true',
    AWS_ACCESS_KEY_ID: 'test',
    AWS_SECRET_ACCESS_KEY: 'test',
    AWS_REGION: 'us-east-1',
    AWS_ENDPOINT_URL: 'http://localstack:4566',
    S3_ENDPOINT_URL: 'http://localstack:4566',
    S3_FORCE_PATH_STYLE: '1',
    S3_BUCKET_NAME: outputs.bucket,
    COGNITO_REGION: 'us-east-1',
    COGNITO_USER_POOL_ID: outputs.cognitoUserPoolId,
    COGNITO_CLIENT_ID: outputs.cognitoClientId,
    COGNITO_CLIENT_SECRET: outputs.cognitoClientSecret || '',
    TEXTRACT_ENDPOINT_URL: 'http://localstack:4566',
    LOCALSTACK_HOST: 'localstack',
    TEST_USER_ID: process.env.TEST_USER_ID || 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  };

  const content = Object.entries(overrides)
    .map(([key, value]) => `${key}=${value ?? ''}`)
    .join('\n');

  await fs.writeFile(apiEnvLocalstackPath, `${content}\n`);
}

async function waitForHealth(url, label, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch (error) {
      // retry
    }
    await delay(2000);
  }

  throw new Error(`Timed out waiting for ${label} health check at ${url}`);
}

async function main() {
  await fs.mkdir(apiEnvOverrideDir, { recursive: true });
  try {
    await fs.access(apiEnvLocalstackPath);
  } catch {
    await fs.writeFile(apiEnvLocalstackPath, '');
  }

  console.log('🔧 Starting core infrastructure (Postgres, Redis, LocalStack)...');
  await runCompose(['up', '-d', 'localstack', 'postgres', 'redis'], { stdio: 'inherit' });

  console.log('⏳ Waiting for LocalStack to be ready...');
  await waitForLocalstack();

  console.log('📦 Reading LocalStack bootstrap outputs...');
  let outputs;
  try {
    outputs = await readLocalstackBootstrap();
  } catch (error) {
    console.warn('⚠️  Failed to read bootstrap outputs, using defaults:', error.message);
    outputs = {
      bucket: process.env.S3_BUCKET_NAME || 'namecard-local-bucket',
      cognitoUserPoolId:
        process.env.COGNITO_USER_POOL_ID || 'local-dev-pool',
      cognitoClientId:
        process.env.COGNITO_USER_POOL_CLIENT_ID || 'local-dev-client',
      cognitoClientSecret:
        process.env.COGNITO_USER_POOL_CLIENT_SECRET || 'local-dev-secret',
    };
  }

  console.log('📝 Writing API LocalStack overrides...');
  await writeApiLocalstackEnv(outputs);

  console.log('🚀 Starting application services...');
  await runCompose(['up', '-d'], { stdio: 'inherit' });

  console.log('⏳ Waiting for API health check...');
  await waitForHealth('http://localhost:3001/health', 'API');

  console.log('⏳ Waiting for frontend health check...');
  await waitForHealth('http://localhost:8080/health', 'Frontend');

  console.log('✅ Local stack is ready.');
}

main().catch(error => {
  console.error('❌ Failed to start local stack:', error.message);
  if (error.stdout) {
    console.error(error.stdout);
  }
  if (error.stderr) {
    console.error(error.stderr);
  }
  process.exit(1);
});
