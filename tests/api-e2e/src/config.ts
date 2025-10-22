import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { ensureCardFixture, seedStatePath } from '@namecard/e2e-shared';
import { createApiClient } from './api-client.js';
import type { RunEnvironment, ScenarioContext } from './types.js';

const optionsSchema = z.object({
  env: z.enum(['local', 'staging']).default('local'),
  dryRun: z.boolean().default(false),
  baseUrl: z.string().url().optional(),
  shareSeed: z.boolean().default(false),
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

  const fixture = await ensureCardFixture();
  const cardImagePath = fixture.path;

  if (fixture.size > MAX_CARD_IMAGE_BYTES) {
    throw new Error(
      `Fixture ${cardImagePath} exceeds ${formatBytes(MAX_CARD_IMAGE_BYTES)} (actual: ${formatBytes(
        fixture.size
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
    sharedSeed: {
      enabled: options.shareSeed,
      seedStatePath,
    },
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
      cardImageSize: fixture.size,
    },
  };
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
