import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

import type {
  ScenarioContext,
  ScenarioDefinition,
  ScenarioOutcome,
  UploadRecord,
  CardRecord,
} from './types.js';

const DRY_RUN_NOTE = 'Scenario not executed in dry-run mode';
const POLL_MAX_ATTEMPTS = 10;
const POLL_INTERVAL_MS = 1000;

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

async function uploadCardImage(context: ScenarioContext): Promise<ScenarioOutcome> {
  if (context.dryRun) {
    return {
      status: 'skipped',
      notes: DRY_RUN_NOTE,
    };
  }

  const user = requireUser(context);
  const buffer = await fs.readFile(context.fixtures.cardImagePath);
  const checksum = createHash('sha256').update(buffer).digest('hex');
  const fileName = `card-${context.state.runId}.jpg`;
  const tag = `run-${context.state.runId.slice(0, 8)}`;

  context.log(`requesting presign for ${fileName}`);
  const upload = await context.api.createUpload(user.accessToken, {
    fileName,
    checksum,
    contentType: 'image/jpeg',
    size: buffer.length,
  });

  context.log(`marking upload ${upload.id} as complete`);
  const completed = await context.api.completeUpload(user.accessToken, upload.id);

  context.log(`initiating scan for upload ${completed.id}`);
  const scanResult = await context.api.scanCard(user.accessToken, {
    fileName,
    imageUrl: completed.cdnUrl,
    tags: [tag],
  });

  context.state.upload = toUploadSnapshot(completed, tag);
  context.state.card = toCardSnapshot(scanResult.card);
  context.state.ocrJobId = scanResult.ocrJobId;
  context.state.searchQuery = tag;

  return {
    status: 'passed',
    notes: `Upload ${completed.id} scanned into card ${scanResult.card.id}`,
  };
}

async function processOcrCallback(context: ScenarioContext): Promise<ScenarioOutcome> {
  if (context.dryRun) {
    return {
      status: 'skipped',
      notes: DRY_RUN_NOTE,
    };
  }

  const user = requireUser(context);
  const card = requireCard(context);

  const company = `E2E Harness Co ${context.state.runId.slice(0, 6)}`;
  const contactName = `Harness Contact ${context.state.runId.slice(0, 4)}`;

  context.log(`updating card ${card.id} with OCR/enrichment results`);
  const updated = await context.api.updateCard(user.accessToken, card.id, {
    name: contactName,
    title: 'Automation Engineer',
    company,
    email: `${context.state.runId.slice(0, 6)}@example.com`,
    notes: 'Populated by API E2E harness',
    tags: card.tags ? Array.from(new Set([...card.tags, 'processed'])) : ['processed'],
  });

  context.state.card = toCardSnapshot(updated);
  context.state.searchQuery = company;

  return {
    status: 'passed',
    notes: `Card ${card.id} enriched with company ${company}`,
  };
}

async function listCardsScenario(context: ScenarioContext): Promise<ScenarioOutcome> {
  if (context.dryRun) {
    return {
      status: 'skipped',
      notes: DRY_RUN_NOTE,
    };
  }

  const user = requireUser(context);
  const card = requireCard(context);

  for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt += 1) {
    const cards = await context.api.listCards(user.accessToken);
    const found = cards.find(item => item.id === card.id);
    if (found) {
      context.state.card = toCardSnapshot(found);
      return {
        status: 'passed',
        notes: `Card ${card.id} visible in list after ${attempt} attempt(s)`,
      };
    }

    context.log(`card ${card.id} not yet visible in list (attempt ${attempt})`);
    await delay(POLL_INTERVAL_MS);
  }

  throw new Error(`Card ${card.id} not returned by /v1/cards within timeout`);
}

async function searchCardsScenario(context: ScenarioContext): Promise<ScenarioOutcome> {
  if (context.dryRun) {
    return {
      status: 'skipped',
      notes: DRY_RUN_NOTE,
    };
  }

  const user = requireUser(context);
  const card = requireCard(context);
  const query = context.state.searchQuery ?? card.company ?? card.name ?? 'Scanned';

  for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt += 1) {
    const results = await context.api.searchCards(user.accessToken, {
      query,
      tags: context.state.upload ? [context.state.upload.tag] : undefined,
    });

    const found = results.find(item => item.id === card.id);
    if (found) {
      context.state.card = toCardSnapshot(found);
      return {
        status: 'passed',
        notes: `Card ${card.id} retrieved via search '${query}' after ${attempt} attempt(s)`,
      };
    }

    context.log(`search miss for '${query}' (attempt ${attempt})`);
    await delay(POLL_INTERVAL_MS);
  }

  throw new Error(`Card ${card.id} not found via search query '${query}'`);
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
  {
    id: 'upload-card-image',
    description: 'Upload card image and ensure OCR job enqueued',
    execute: uploadCardImage,
  },
  {
    id: 'process-ocr-callback',
    description: 'Simulate Textract callback and enrichment workflow',
    execute: processOcrCallback,
  },
  {
    id: 'list-cards',
    description: 'Verify newly created card appears in list endpoint',
    execute: listCardsScenario,
  },
  {
    id: 'search-cards',
    description: 'Search index includes newly created card',
    execute: searchCardsScenario,
  },
  pendingScenario(
    'tear-down-user',
    'Clean up Cognito/S3/database artefacts created during run',
    'Invoke teardown utility to remove tenant data and fixtures.'
  ),
];

function requireUser(context: ScenarioContext) {
  const user = context.state.user;
  if (!user) {
    throw new Error('Scenario requires authenticated user from previous step');
  }
  return user;
}

function requireCard(context: ScenarioContext) {
  const card = context.state.card;
  if (!card) {
    throw new Error('Scenario requires card produced by previous step');
  }
  return card;
}

function toUploadSnapshot(upload: UploadRecord, tag: string) {
  return {
    id: upload.id,
    fileName: upload.fileName,
    cdnUrl: upload.cdnUrl,
    presignedUrl: upload.presignedUrl,
    checksum: upload.checksum,
    size: upload.size,
    tag,
  };
}

function toCardSnapshot(card: CardRecord) {
  return {
    id: card.id,
    name: card.name ?? null,
    company: card.company ?? null,
    tags: card.tags ?? [],
  };
}
