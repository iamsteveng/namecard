import { performance } from 'node:perf_hooks';

import chalk from 'chalk';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { createHarnessContext, formatBytes } from './config.js';
import { scenarios } from './scenarios.js';
import type { ScenarioDefinition, ScenarioOutcome, ScenarioStatus } from './types.js';

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('env', {
      type: 'string',
      choices: ['local', 'staging'] as const,
      default: 'local',
      describe: 'Target environment for the API harness',
    })
    .option('dry-run', {
      type: 'boolean',
      default: false,
      describe: 'Skip API calls and mark scenarios as pending',
    })
    .option('base-url', {
      type: 'string',
      describe: 'Override API base URL (e.g., https://api.example.com/api)',
    })
    .option('scenario', {
      type: 'array',
      string: true,
      describe: 'Run a subset of scenarios by id',
    })
    .option('share-seed', {
      type: 'boolean',
      default: undefined,
      describe: 'Persist seeded user/card data for reuse by other test suites',
    })
    .strict()
    .help()
    .parse();

  const argvRecord = argv as Record<string, unknown>;
  const dryRunCandidate =
    typeof argvRecord['dryRun'] === 'boolean'
      ? (argvRecord['dryRun'] as boolean)
      : typeof argvRecord['dry-run'] === 'boolean'
        ? (argvRecord['dry-run'] as boolean)
        : false;

  const dryRunFlag = Boolean(dryRunCandidate);

  const shareSeedCandidate =
    typeof argvRecord['shareSeed'] === 'boolean'
      ? (argvRecord['shareSeed'] as boolean)
      : typeof argvRecord['share-seed'] === 'boolean'
        ? (argvRecord['share-seed'] as boolean)
        : undefined;

  const shareSeedEnv = process.env['API_E2E_SHARE_SEED'];
  const shareSeedFlag =
    shareSeedCandidate ??
    (typeof shareSeedEnv === 'string'
      ? ['1', 'true', 'yes', 'on'].includes(shareSeedEnv.toLowerCase())
      : false);

  const { options, context, fixtures } = await createHarnessContext({
    env: argv.env as 'local' | 'staging',
    dryRun: Boolean(dryRunFlag),
    baseUrl: (argvRecord['base-url'] as string | undefined) ?? undefined,
    shareSeed: shareSeedFlag,
  });

  const scenarioFilterArg = (argvRecord['scenario'] as string[] | undefined) ?? [];
  const selectedIds = new Set(scenarioFilterArg.map(id => id.toString()));
  const selectedScenarios = selectScenarios(selectedIds);

  const modeLabel = options.dryRun ? chalk.yellow('DRY-RUN') : chalk.green('EXECUTION');
  console.log(chalk.bold(`API E2E Harness (${modeLabel})`));
  console.log(`Environment: ${chalk.cyan(options.env)}`);
  if (options.baseUrl) {
    console.log(`Base URL: ${chalk.cyan(options.baseUrl)}`);
  }
  console.log(
    `Shared seed: ${options.shareSeed ? chalk.green('enabled') : chalk.gray('disabled')}`
  );
  if (options.shareSeed && context.state.sharedSeed?.seedStatePath) {
    console.log(`Seed file: ${chalk.cyan(context.state.sharedSeed.seedStatePath)}`);
  }
  console.log(
    `Card fixture: ${chalk.cyan(fixtures.cardImagePath)} (${formatBytes(fixtures.cardImageSize)})`
  );
  if (selectedIds.size > 0) {
    console.log(`Scenario filter: ${Array.from(selectedIds).join(', ')}`);
  }

  if (selectedScenarios.length === 0) {
    console.warn(chalk.yellow('No scenarios selected. Exiting.'));
    return;
  }

  const results: RecordedScenario[] = [];

  for (const scenario of selectedScenarios) {
    console.log();
    console.log(chalk.blueBright(`→ ${scenario.id}`));
    console.log(`   ${scenario.description}`);

    const scenarioLogger = createScenarioLogger(scenario.id);
    const scopedContext = { ...context, log: scenarioLogger };

    const start = performance.now();
    let outcome: ScenarioOutcome;

    try {
      outcome = await scenario.execute(scopedContext);
    } catch (error) {
      outcome = {
        status: 'failed',
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }

    const durationMs = performance.now() - start;
    renderOutcome(outcome, durationMs);
    results.push({ scenario, outcome, durationMs });
  }

  summarize(results);

  const hasFailure = results.some(result => result.outcome.status === 'failed');
  if (hasFailure) {
    process.exitCode = 1;
  }
}

function selectScenarios(selectedIds: Set<string>): ScenarioDefinition[] {
  if (selectedIds.size === 0) {
    return scenarios;
  }

  const selected: ScenarioDefinition[] = [];
  const missing: string[] = [];

  for (const id of selectedIds) {
    const match = scenarios.find(scenario => scenario.id === id);
    if (match) {
      selected.push(match);
    } else {
      missing.push(id);
    }
  }

  if (missing.length > 0) {
    console.warn(chalk.yellow(`Unknown scenario id(s): ${missing.join(', ')}`));
  }

  return selected;
}

function createScenarioLogger(id: string) {
  return (message: string) => {
    const prefix = chalk.gray(`   [${id}]`);
    console.log(`${prefix} ${message}`);
  };
}

function renderOutcome(outcome: ScenarioOutcome, durationMs: number): void {
  const statusLabel = formatStatus(outcome.status);
  console.log(`   Status: ${statusLabel} ${chalk.gray(`(${durationMs.toFixed(0)} ms)`)}`);

  if (outcome.notes) {
    console.log(`   Notes: ${chalk.gray(outcome.notes)}`);
  }

  if (outcome.error) {
    console.error(chalk.red(`   Error: ${outcome.error.message}`));
    if (outcome.error.stack) {
      console.error(chalk.gray(outcome.error.stack));
    }
  }
}

function formatStatus(status: ScenarioStatus): string {
  switch (status) {
    case 'passed':
      return chalk.green('PASSED');
    case 'failed':
      return chalk.red('FAILED');
    case 'skipped':
    default:
      return chalk.yellow('SKIPPED');
  }
}

function summarize(results: RecordedScenario[]): void {
  console.log();
  console.log(chalk.bold('Summary'));

  const total = results.length;
  const passed = results.filter(result => result.outcome.status === 'passed').length;
  const skipped = results.filter(result => result.outcome.status === 'skipped').length;
  const failed = results.filter(result => result.outcome.status === 'failed').length;

  console.log(`  Total:   ${total}`);
  console.log(chalk.green(`  Passed:  ${passed}`));
  console.log(chalk.yellow(`  Skipped: ${skipped}`));
  console.log(chalk.red(`  Failed:  ${failed}`));
}

type RecordedScenario = {
  scenario: ScenarioDefinition;
  outcome: ScenarioOutcome;
  durationMs: number;
};

await main();
