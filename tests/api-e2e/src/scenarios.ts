import type { ScenarioDefinition } from './types.js';

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
  pendingScenario(
    'register-new-user',
    'Register a new user and acquire session tokens',
    'Implement registration + login flow against /v1/auth endpoints.'
  ),
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
