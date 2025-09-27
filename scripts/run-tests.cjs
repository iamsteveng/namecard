#!/usr/bin/env node
const { spawnSync } = require('child_process');

const rawArgs = process.argv.slice(2);
let workspaceFilter;
const passthroughArgs = [];

for (let index = 0; index < rawArgs.length; index += 1) {
  const arg = rawArgs[index];
  if (arg === '--filter' && rawArgs[index + 1]) {
    workspaceFilter = rawArgs[index + 1];
    passthroughArgs.push(arg, rawArgs[index + 1]);
    index += 1;
    continue;
  }

  passthroughArgs.push(arg);
}

const pnpmArgs = ['-r'];
if (workspaceFilter) {
  pnpmArgs.push('--filter', resolveWorkspaceSelector(workspaceFilter));
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

  return filterValue;
}
