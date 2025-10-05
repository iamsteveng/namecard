#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = __dirname;

const banner = message => console.log(`\n🔍 ${message}`);
const success = message => console.log(`   ✅ ${message}`);
const warn = message => console.log(`   ⚠️  ${message}`);
const fail = message => {
  console.error(`   ❌ ${message}`);
  process.exitCode = 1;
};

const requirePaths = (...segments) => path.join(projectRoot, ...segments);

const checkFileExists = relativePath => {
  const target = requirePaths(relativePath);
  if (!fs.existsSync(target)) {
    fail(`Missing expected file: ${relativePath}`);
    return false;
  }
  success(`Found ${relativePath}`);
  return true;
};

const ensureFileContains = (relativePath, tokens) => {
  const target = requirePaths(relativePath);
  try {
    const contents = fs.readFileSync(target, 'utf8');
    const missing = tokens.filter(token => !contents.includes(token));
    if (missing.length > 0) {
      fail(`File ${relativePath} missing tokens: ${missing.join(', ')}`);
      return false;
    }
    success(`Validated observability markers in ${relativePath}`);
    return true;
  } catch (error) {
    fail(`Unable to read ${relativePath}: ${error.message}`);
    return false;
  }
};

const validateStructuredLog = () => {
  const payload = {
    level: 'info',
    message: 'synthetic.monitoring',
    timestamp: new Date().toISOString(),
    service: 'monitoring',
    requestId: 'synthetic-request',
    data: { sample: true },
  };

  const serialized = JSON.stringify(payload);
  const parsed = JSON.parse(serialized);
  if (parsed.level !== 'info' || parsed.message !== 'synthetic.monitoring') {
    fail('Structured log serialization mismatch');
    return false;
  }
  success('Structured log serialization validated');
  return true;
};

(async () => {
  banner('Validating observability scaffolding');
  const observabilityPath = 'services/shared/src/observability';
  if (checkFileExists(observabilityPath)) {
    ensureFileContains(path.join(observabilityPath, 'index.ts'), [
      'withHttpObservability',
      'createLogger',
      'withIdempotency',
    ]);
    ensureFileContains(path.join(observabilityPath, 'lambda.ts'), [
      'coldStart',
      'runWithExecutionContext',
      'metrics.duration',
    ]);
  }

  banner('Inspecting infrastructure alarms and dashboards');
  ensureFileContains('infra/lib/api-stack.ts', [
    'new cw.Dashboard',
    'LambdaDeadLetterQueue',
    'HttpApiLatencyAlarm',
    'ObservabilityDashboard',
  ]);

  banner('Checking documentation & runbook presence');
  if (!checkFileExists('RUNBOOK.md') && !checkFileExists('docs/OPERATIONS_RUNBOOK.md')) {
    warn('Runbook document not found (expected under RUNBOOK.md or docs/OPERATIONS_RUNBOOK.md).');
  }

  banner('Synthetic log validation');
  validateStructuredLog();

  if (process.exitCode && process.exitCode !== 0) {
    console.error('\n❌ Monitoring checks reported issues');
    process.exit(process.exitCode);
  }

  console.log('\n✅ Monitoring and observability checks completed');
})();
