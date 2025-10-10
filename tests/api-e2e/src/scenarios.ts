import { randomUUID } from 'node:crypto';

import type { ScenarioContext, ScenarioDefinition, ScenarioOutcome } from './types.js';

const DRY_RUN_NOTE = 'Scenario not executed in dry-run mode';

async function registerNewUser(context: ScenarioContext): Promise<ScenarioOutcome> {
  if (context.dryRun) {
    return {
      status: 'skipped',
      notes: DRY_RUN_NOTE,
    };
  }

  const uniqueSuffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const email = `e2e+${context.state.runId}.${uniqueSuffix}@example.com`;
  const password = `E2e!${context.state.runId.slice(0, 8)}`;
  const name = 'API E2E User';

  context.log(`registering user ${email}`);
  const registration = await context.api.registerUser({ email, password, name });

  context.log('registration complete, performing explicit login');
  const session = await context.api.login({ email, password });

  context.log('fetching profile to confirm persisted state');
  const profile = await context.api.getProfile(session.accessToken);

  if (profile.email.toLowerCase() !== email.toLowerCase()) {
    throw new Error(`Profile email mismatch. Expected ${email}, received ${profile.email}`);
  }

  context.state.user = {
    email,
    password,
    userId: registration.userId,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
  };

  return {
    status: 'passed',
    notes: `Registered and authenticated user ${email}`,
  };
}

function pendingScenario(id: string, description: string, todo: string): ScenarioDefinition {
  return {
    id,
    description,
    execute: async context => {
      const scope = context.dryRun ? 'dry-run' : 'pending';
      context.log(`${scope}: ${todo}`);
      return {
        status: 'skipped',
        notes: todo,
      };
    },
  };
}

export const scenarios: ScenarioDefinition[] = [
  {
    id: 'register-new-user',
    description: 'Register a new user and acquire session tokens',
    execute: registerNewUser,
  },
  pendingScenario(
    'upload-card-image',
    'Upload card image and ensure OCR job enqueued',
    'Request presigned upload URL and verify job status transitions to PENDING.'
  ),
  pendingScenario(
    'process-ocr-callback',
    'Simulate Textract callback and enrichment workflow',
    'Invoke OCR/Textract processing via LocalStack or direct handler call.'
  ),
  pendingScenario(
    'list-cards',
    'Verify newly created card appears in list endpoint',
    'Fetch /v1/cards and assert card payload fields.'
  ),
  pendingScenario(
    'search-cards',
    'Search index includes newly created card',
    'Query /v1/cards/search and /v1/search/cards for fresh OCR content.'
  ),
  pendingScenario(
    'tear-down-user',
    'Clean up Cognito/S3/database artefacts created during run',
    'Invoke teardown utility to remove tenant data and fixtures.'
  ),
];
