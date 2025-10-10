#!/usr/bin/env node
const { spawnSync } = require('child_process');

const rawArgs = process.argv.slice(2);
const mappedArgs = [];

for (let index = 0; index < rawArgs.length; index += 1) {
  const arg = rawArgs[index];
  if ((arg === '--filter' || arg === '-f') && rawArgs[index + 1]) {
    index += 1;
    mappedArgs.push('--testPathPattern', rawArgs[index]);
    continue;
  }

  mappedArgs.push(arg);
}

const env = { ...process.env };
const vmFlag = '--experimental-vm-modules';
env.NODE_OPTIONS = env.NODE_OPTIONS
  ? env.NODE_OPTIONS.includes(vmFlag)
    ? env.NODE_OPTIONS
    : `${env.NODE_OPTIONS} ${vmFlag}`.trim()
  : vmFlag;

const result = spawnSync('jest', mappedArgs, {
  stdio: 'inherit',
  env,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

if (result.status !== null) {
  process.exit(result.status);
}

process.exit(1);
