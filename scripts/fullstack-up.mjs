#!/usr/bin/env node
import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';
import path from 'path';

const repoRoot = path.resolve(new URL('.', import.meta.url).pathname, '..');
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
  console.log('🔧 Starting core infrastructure (Postgres, Redis, LocalStack)...');
  await runCompose(['up', '-d', 'localstack', 'postgres', 'redis'], { stdio: 'inherit' });

  console.log('⏳ Waiting for LocalStack to be ready...');
  await waitForLocalstack();

  console.log('🚀 Starting application services...');
  await runCompose(['up', '-d'], { stdio: 'inherit' });

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
