import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import type { EnvironmentKey } from '../lib/api-stack';
import { SERVICE_DEFINITIONS } from '../lib/api-stack';

type HarnessResult = {
  readonly serviceId: string;
  readonly expected: number;
  readonly actual?: number;
  readonly passed: boolean;
  readonly message: string;
};

const VALID_ENVIRONMENTS: EnvironmentKey[] = ['dev', 'staging', 'prod'];

function parseEnvironment(input: string | undefined): EnvironmentKey {
  if (!input) {
    throw new Error('Harness requires an environment argument (dev | staging | prod).');
  }

  const normalized = input.toLowerCase();
  if ((VALID_ENVIRONMENTS as string[]).includes(normalized)) {
    return normalized as EnvironmentKey;
  }

  throw new Error(`Unsupported environment '${input}'. Expected one of ${VALID_ENVIRONMENTS.join(', ')}.`);
}

function ensureTemplateExists(templatePath: string, environment: string): void {
  if (existsSync(templatePath)) {
    return;
  }

  console.log(`No synthesized template found at ${templatePath}. Running CDK synth to produce it...`);
  execSync(`pnpm cdk synth NameCardApi-${environment} --context environment=${environment}`, {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
  });

  if (!existsSync(templatePath)) {
    throw new Error(`Expected template at ${templatePath} after synth, but it is still missing.`);
  }
}

function loadTemplate(templatePath: string): Record<string, any> {
  const raw = readFileSync(templatePath, 'utf8');
  return JSON.parse(raw) as Record<string, any>;
}

function collectAliasConcurrency(template: Record<string, any>): Map<string, number> {
  const resources: Record<string, any> = template.Resources ?? {};
  const aliasConcurrency = new Map<string, number>();

  for (const [logicalId, resource] of Object.entries(resources)) {
    if (resource?.Type !== 'AWS::Lambda::Alias') {
      continue;
    }

    const provisioned: number | undefined = resource.Properties?.ProvisionedConcurrencyConfig?.ProvisionedConcurrentExecutions;
    if (typeof provisioned !== 'number') {
      continue;
    }

    const aliasPrefix = logicalId.replace(/[A-F0-9]{8}$/i, '');
    const serviceId = aliasPrefix.replace(/Alias$/i, '');

    aliasConcurrency.set(serviceId, provisioned);
  }

  return aliasConcurrency;
}

function evaluate(environment: EnvironmentKey, aliasConcurrency: Map<string, number>): HarnessResult[] {
  const expected = SERVICE_DEFINITIONS
    .map((service) => {
      const expectedProvisioned = service.scaling.provisionedConcurrency?.[environment];
      if (expectedProvisioned && expectedProvisioned > 0) {
        return { serviceId: service.id, expected: expectedProvisioned };
      }
      return undefined;
    })
    .filter((entry): entry is { serviceId: string; expected: number } => Boolean(entry));

  if (expected.length === 0) {
    return [];
  }

  return expected.map(({ serviceId, expected: expectedValue }) => {
    const actual = aliasConcurrency.get(serviceId);

    if (actual === undefined) {
      return {
        serviceId,
        expected: expectedValue,
        actual,
        passed: false,
        message: 'Alias with Provisioned Concurrency not found in synthesized template.',
      } satisfies HarnessResult;
    }

    if (actual < expectedValue) {
      return {
        serviceId,
        expected: expectedValue,
        actual,
        passed: false,
        message: `Provisioned concurrency below expectation (${actual} < ${expectedValue}).`,
      } satisfies HarnessResult;
    }

    return {
      serviceId,
      expected: expectedValue,
      actual,
      passed: true,
      message: 'Provisioned concurrency meets expectation.',
    } satisfies HarnessResult;
  });
}

function printSummary(environment: EnvironmentKey, results: HarnessResult[]): void {
  console.log(`\n=== Provisioned Concurrency Harness (${environment}) ===`);
  if (results.length === 0) {
    console.log('No services configured with provisioned concurrency for this environment. Nothing to validate.');
    return;
  }

  const rows = results.map((result) => ({
    Service: result.serviceId,
    Expected: result.expected,
    Actual: result.actual ?? '—',
    Status: result.passed ? 'PASS' : 'FAIL',
    Notes: result.message,
  }));

  console.table(rows);

  const failures = results.filter((result) => !result.passed);
  if (failures.length > 0) {
    throw new Error(`Provisioned concurrency harness failed for ${failures.length} service(s).`);
  }

  console.log('Harness complete. All provisioned concurrency expectations satisfied.');
}

async function main(): Promise<void> {
  const [, , environmentArg] = process.argv;
  const environment = parseEnvironment(environmentArg ?? process.env.HARNESS_ENV);

  const templatePath = path.resolve(__dirname, `../cdk.out/NameCardApi-${environment}.template.json`);
  ensureTemplateExists(templatePath, environment);

  const template = loadTemplate(templatePath);
  const aliasConcurrency = collectAliasConcurrency(template);
  const results = evaluate(environment, aliasConcurrency);
  printSummary(environment, results);
}

main().catch((error) => {
  console.error('\nHarness execution failed.');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
