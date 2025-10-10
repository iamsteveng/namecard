import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { createApiClient } from './api-client.js';
import type { RunEnvironment, ScenarioContext } from './types.js';

const optionsSchema = z.object({
  env: z.enum(['local', 'staging']).default('local'),
  dryRun: z.boolean().default(false),
  baseUrl: z.string().url().optional(),
});

const MAX_CARD_IMAGE_BYTES = 200 * 1024; // 200 KB ceiling per plan guardrail

export interface HarnessInitResult {
  options: HarnessOptions;
  context: ScenarioContext;
  fixtures: {
    cardImagePath: string;
    cardImageSize: number;
  };
}

export type HarnessOptions = z.infer<typeof optionsSchema>;

export async function createHarnessContext(
  rawOptions: Partial<HarnessOptions>
): Promise<HarnessInitResult> {
  const options = optionsSchema.parse(rawOptions);

  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const packageRoot = resolve(moduleDir, '..');
  const fixturesDir = resolve(packageRoot, '../fixtures');
  const cardImagePath = resolve(fixturesDir, 'card-sample.jpg');

  const stats = await ensureFixture(cardImagePath);

  if (stats.size > MAX_CARD_IMAGE_BYTES) {
    throw new Error(
      `Fixture ${cardImagePath} exceeds ${formatBytes(MAX_CARD_IMAGE_BYTES)} (actual: ${formatBytes(
        stats.size
      )}).`
    );
  }

  const baseUrlEnv =
    options.baseUrl ??
    process.env[`API_E2E_BASE_URL_${options.env.toUpperCase()}`] ??
    process.env['API_E2E_BASE_URL'];

  if (options.env !== 'local' && !options.dryRun && !baseUrlEnv) {
    throw new Error(
      'API_E2E_BASE_URL (or --base-url) must be provided for non-local environments.'
    );
  }

  const api = await createApiClient(options.env as RunEnvironment, options.dryRun, {
    baseUrl: baseUrlEnv,
    apiKey: process.env['API_E2E_STAGE_API_KEY'] ?? process.env['API_E2E_API_KEY'],
  });
  const state = {
    runId: randomUUID(),
  };

  const context: ScenarioContext = {
    env: options.env as RunEnvironment,
    dryRun: options.dryRun,
    fixtures: {
      cardImagePath,
    },
    log: (message: string) => {
      // The CLI will replace this logger per-scenario; this is a fallback.
      console.log(message);
    },
    api,
    state,
  };

  return {
    options,
    context,
    fixtures: {
      cardImagePath,
      cardImageSize: stats.size,
    },
  };
}

async function ensureFixture(path: string) {
  try {
    const stats = await fs.stat(path);
    if (!stats.isFile()) {
      throw new Error(`${path} exists but is not a file.`);
    }
    return stats;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Required fixture missing: ${path} (${message})`);
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }

  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}
