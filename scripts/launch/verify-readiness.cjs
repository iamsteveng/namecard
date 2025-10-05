#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..', '..');
const launchDir = path.join(rootDir, 'launch');
const checklistPath = path.join(launchDir, 'POST_LAUNCH_CHECKLIST.md');
const budgetsPath = path.join(launchDir, 'budgets.json');
const monitoringPath = path.join(rootDir, 'RUNBOOK.md');

const [, , command = 'verify', ...rawArgs] = process.argv;
const errors = [];

function log(message) {
  process.stdout.write(`${message}\n`);
}

function fail(message) {
  errors.push(message);
  process.stderr.write(`ERROR: ${message}\n`);
}

function loadFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    fail(`${label} not found at ${path.relative(rootDir, filePath)}`);
    return '';
  }
  return fs.readFileSync(filePath, 'utf8');
}

function ensureChecklist() {
  const contents = loadFile(checklistPath, 'Post-launch checklist');
  if (!contents) {
    return;
  }

  const requiredHeadings = [
    '## Pre-Deployment Verification',
    '## Deployment Execution',
    '## Post-Launch Verification',
    '## Rollback & Recovery Signals',
  ];

  requiredHeadings.forEach(heading => {
    if (!contents.includes(heading)) {
      fail(`Checklist missing expected heading: ${heading}`);
    }
  });

  const keywordExpectations = [
    'pnpm run ci:quality',
    'pnpm run migrate:validate',
    'synthetic monitor',
    'CloudWatch dashboard',
    'cost anomaly',
    'rollback trigger',
  ];

  keywordExpectations.forEach(keyword => {
    if (!contents.toLowerCase().includes(keyword.toLowerCase())) {
      fail(`Checklist missing expected guidance for: ${keyword}`);
    }
  });
}

function ensureBudgets() {
  if (!fs.existsSync(budgetsPath)) {
    fail(`Budgets configuration missing at ${path.relative(rootDir, budgetsPath)}`);
    return;
  }

  let budgets;
  try {
    budgets = JSON.parse(fs.readFileSync(budgetsPath, 'utf8'));
  } catch (error) {
    fail(`Unable to parse budgets.json: ${error.message}`);
    return;
  }

  if (!Array.isArray(budgets) || budgets.length === 0) {
    fail('Budgets configuration must be a non-empty array');
    return;
  }

  const requiredServices = new Set(['auth', 'cards', 'ocr', 'enrichment', 'uploads', 'search']);

  budgets.forEach((entry, index) => {
    const context = `budgets[${index}]`;
    if (typeof entry.service !== 'string' || entry.service.length === 0) {
      fail(`${context} missing service identifier`);
    }
    if (typeof entry.environment !== 'string' || entry.environment.length === 0) {
      fail(`${context} missing environment`);
    }
    if (typeof entry.monthlyBudgetUsd !== 'number' || entry.monthlyBudgetUsd <= 0) {
      fail(`${context} must define positive monthlyBudgetUsd`);
    }
    if (typeof entry.p95LatencyTargetMs !== 'number' || entry.p95LatencyTargetMs <= 0) {
      fail(`${context} must define positive p95LatencyTargetMs`);
    }
    if (typeof entry.owner !== 'string' || entry.owner.length === 0) {
      fail(`${context} missing owner contact`);
    }
    requiredServices.delete(entry.service);
  });

  if (requiredServices.size > 0) {
    fail(`Budgets missing entries for services: ${Array.from(requiredServices).join(', ')}`);
  }
}

function ensureMonitoringNarrative() {
  const contents = loadFile(monitoringPath, 'Operations runbook');
  if (!contents) {
    return;
  }

  const expectedPhrases = [
    'Lambda errors',
    'DLQ',
    'CloudWatch dashboard',
    'rollback',
  ];

  expectedPhrases.forEach(phrase => {
    if (!contents.includes(phrase)) {
      fail(`Runbook missing monitoring hook context for: ${phrase}`);
    }
  });
}

function parseFlags(argList) {
  return argList.reduce((acc, raw) => {
    if (!raw.startsWith('--')) {
      return acc;
    }
    const [key, value = 'true'] = raw.replace(/^--/, '').split('=');
    acc[key] = value;
    return acc;
  }, {});
}

function renderPlanSummary() {
  log('CI/CD launch plan summary:');
  log('- run pnpm run ci:quality for lint/type/test gates');
  log('- run pnpm run ci:infra-dry-run for migration validation and schema orchestrator dry run');
  log('- run pnpm run launch:verify to assert budgets, monitoring, and launch checklist');
}

function recordDeployment(opts) {
  const environment = opts.environment ?? 'staging';
  const runMigrations = opts['run-migrations'] ?? opts.runMigrations ?? 'true';
  const commit = opts.commit ?? process.env.GITHUB_SHA ?? 'unknown';

  log(`Deployment record:`);
  log(`  environment: ${environment}`);
  log(`  commit: ${commit}`);
  log(`  runMigrations: ${runMigrations}`);
}

switch (command) {
  case 'plan':
    ensureChecklist();
    ensureBudgets();
    renderPlanSummary();
    break;
  case 'verify':
    ensureChecklist();
    ensureBudgets();
    ensureMonitoringNarrative();
    break;
  case 'record':
    recordDeployment(parseFlags(rawArgs));
    break;
  default:
    fail(`Unknown command: ${command}`);
}

if (errors.length > 0) {
  process.exitCode = 1;
} else {
  if (command === 'verify') {
    log('Launch readiness artefacts verified');
  }
}
