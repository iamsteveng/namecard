#!/usr/bin/env node
const { spawnSync } = require('child_process');

const rawArgs = process.argv.slice(2);
let workspaceFilter;
let scopeValue;
const passthroughArgs = [];

for (let index = 0; index < rawArgs.length; index += 1) {
  const arg = rawArgs[index];
  if (arg === '--filter' && rawArgs[index + 1]) {
    workspaceFilter = rawArgs[index + 1];
    passthroughArgs.push(arg, rawArgs[index + 1]);
    index += 1;
    continue;
  }

  if (arg === '--scope' && rawArgs[index + 1]) {
    scopeValue = rawArgs[index + 1];
    index += 1;
    continue;
  }

  passthroughArgs.push(arg);
}

const pnpmArgs = ['-r'];
const resolvedFilter = workspaceFilter ?? scopeValue;

if (resolvedFilter) {
  pnpmArgs.push('--filter', resolveWorkspaceSelector(resolvedFilter));
}

pnpmArgs.push('run', 'test', ...passthroughArgs);

const result = spawnSync('pnpm', pnpmArgs, {
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

if (typeof result.status === 'number') {
  process.exit(result.status);
}

process.exit(1);

function resolveWorkspaceSelector(filterValue) {
  if (!filterValue) {
    return filterValue;
  }

  const normalized = filterValue.toLowerCase();

  if (normalized === 'migrator') {
    return '@namecard/infra';
  }

  if (normalized === 'services') {
    return '@namecard/shared';
  }

  return filterValue;
}
