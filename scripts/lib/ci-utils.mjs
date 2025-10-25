import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let composeCommand = null;

const truthyValues = new Set(['1', 'true', 'yes', 'on']);

export function parseBoolean(value) {
  if (typeof value !== 'string') {
    return false;
  }
  return truthyValues.has(value.trim().toLowerCase());
}

export function runCommand(command, args, options = {}) {
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

export async function ensureComposeCommand() {
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
    const errorLines = [];
    if (dockerComposeError) {
      errorLines.push(`docker compose check failed: ${dockerComposeError.message}`);
    }
    errorLines.push(`docker-compose check failed: ${error.message}`);
    errorLines.push('Docker (with Compose) is required to run local CI workflows.');
    const diagnostic = errorLines.join('\n  - ');
    throw new Error(`Unable to locate Docker Compose support.\n  - ${diagnostic}`);
  }
}

export async function runCompose(args, options = {}) {
  const cmd = await ensureComposeCommand();
  return runCommand(cmd[0], [...cmd.slice(1), ...args], options);
}
