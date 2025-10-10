import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { z } from 'zod';

import type { ApiClient, AuthSession, CardRecord, RunEnvironment, UploadRecord } from './types.js';

interface LambdaHttpResponse {
  statusCode: number;
  headers?: Record<string, string | number | boolean | undefined>;
  body?: string | null;
}

interface LambdaInvocationResult {
  response: LambdaHttpResponse;
  payload: unknown;
}

type LambdaHandler = (event: unknown, context?: unknown) => Promise<LambdaHttpResponse>;

const SERVICES: Record<string, string> = {
  auth: 'services/auth/handler.ts',
  cards: 'services/cards/handler.ts',
  uploads: 'services/uploads/handler.ts',
  search: 'services/search/handler.ts',
  ocr: 'services/ocr/handler.ts',
  enrichment: 'services/enrichment/handler.ts',
};

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '../../../');

let handlersPromise: Promise<Record<string, LambdaHandler>> | null = null;

async function loadHandlers(): Promise<Record<string, LambdaHandler>> {
  if (!handlersPromise) {
    handlersPromise = (async () => {
      const entries = await Promise.all(
        Object.entries(SERVICES).map(async ([service, relativePath]) => {
          const filePath = path.join(repoRoot, relativePath);
          const module = await import(pathToFileURL(filePath).href);
          if (!module?.handler) {
            throw new Error(`Service ${service} at ${filePath} does not export a handler`);
          }
          return [service, module.handler as LambdaHandler];
        })
      );
      return Object.fromEntries(entries);
    })();
  }

  return handlersPromise;
}

function buildLambdaEvent({
  method,
  path: rawPath,
  headers,
  query,
  body,
}: {
  method: string;
  path: string;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}) {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers ?? {}).map(([key, value]) => [key.toLowerCase(), value])
  );

  const queryEntries = query
    ? Object.entries(query).filter(([, value]) => value !== undefined && value !== null)
    : [];

  const queryStringParameters = queryEntries.length
    ? Object.fromEntries(queryEntries.map(([key, value]) => [key, String(value)]))
    : null;

  const rawQueryString = queryEntries.length
    ? new URLSearchParams(queryEntries.map(([key, value]) => [key, String(value)])).toString()
    : '';

  const serializedBody =
    typeof body === 'string'
      ? body
      : body !== null && body !== undefined
        ? JSON.stringify(body)
        : null;

  return {
    version: '2.0',
    httpMethod: method.toUpperCase(),
    routeKey: `${method.toUpperCase()} ${rawPath}`,
    rawPath,
    rawQueryString,
    headers: normalizedHeaders,
    queryStringParameters,
    pathParameters: null,
    body: serializedBody,
    isBase64Encoded: false,
    stageVariables: null,
    requestContext: {
      requestId: `api-e2e-${randomUUID()}`,
      http: {
        method: method.toUpperCase(),
        path: rawPath,
      },
    },
  };
}

async function invokeLambda(
  service: string,
  event: ReturnType<typeof buildLambdaEvent>
): Promise<LambdaInvocationResult> {
  const handlers = await loadHandlers();
  const handler = handlers[service];
  if (!handler) {
    throw new Error(`No lambda handler registered for service ${service}`);
  }

  const response = (await handler(event)) as LambdaHttpResponse;
  let payload: unknown;
  if (response.body) {
    try {
      payload = JSON.parse(response.body);
    } catch (error) {
      throw new Error(`Failed to parse response body from ${service}: ${(error as Error).message}`);
    }
  }

  return { response, payload };
}

function resolveServiceFromPath(pathname: string): string {
  const segments = pathname.replace(/^\/+/, '').split('/');
  if (segments[0] === 'api') {
    segments.shift();
  }
  if (segments[0] !== 'v1' || segments.length < 2) {
    throw new Error(`Unsupported API path: ${pathname}`);
  }
  const service = segments[1];
  if (!service) {
    throw new Error(`Unable to resolve service from path: ${pathname}`);
  }
  return service;
}

class LocalLambdaClient implements ApiClient {
  async registerUser(input: {
    email: string;
    password: string;
    name: string;
  }): Promise<AuthSession> {
    const { response, payload } = await this.invoke('/v1/auth/register', 'POST', {
      body: input,
      headers: { 'content-type': 'application/json' },
    });

    if (response.statusCode >= 400) {
      throw buildApiError('registerUser', response, payload);
    }

    const { user, session } = parseSessionEnvelope(payload);

    return {
      userId: user.id,
      email: user.email,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
    };
  }

  async login(input: { email: string; password: string }): Promise<AuthSession> {
    const { response, payload } = await this.invoke('/v1/auth/login', 'POST', {
      body: input,
      headers: { 'content-type': 'application/json' },
    });

    if (response.statusCode >= 400) {
      throw buildApiError('login', response, payload);
    }

    const { user, session } = parseSessionEnvelope(payload);

    return {
      userId: user.id,
      email: user.email,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
    };
  }

  async getProfile(accessToken: string): Promise<{ email: string }> {
    const { response, payload } = await this.invoke('/v1/auth/profile', 'GET', {
      headers: { authorization: `Bearer ${accessToken}` },
    });

    if (response.statusCode >= 400) {
      throw buildApiError('getProfile', response, payload);
    }

    const profile = parseProfileEnvelope(payload);
    return { email: profile.email };
  }

  async createUpload(
    accessToken: string,
    input: { fileName: string; checksum: string; contentType: string; size: number }
  ): Promise<UploadRecord> {
    const { response, payload } = await this.invoke('/v1/uploads/presign', 'POST', {
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: input,
    });

    if (response.statusCode >= 400) {
      throw buildApiError('createUpload', response, payload);
    }

    return parseUploadEnvelope(payload).upload;
  }

  async completeUpload(accessToken: string, uploadId: string): Promise<UploadRecord> {
    const { response, payload } = await this.invoke('/v1/uploads/complete', 'POST', {
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: { uploadId },
    });

    if (response.statusCode >= 400) {
      throw buildApiError('completeUpload', response, payload);
    }

    return parseUploadEnvelope(payload).upload;
  }

  async scanCard(
    accessToken: string,
    input: { fileName: string; imageUrl: string; tags?: string[] }
  ): Promise<{ card: CardRecord; ocrJobId: string; enrichmentId: string }> {
    const { response, payload } = await this.invoke('/v1/cards/scan', 'POST', {
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: input,
    });

    if (response.statusCode >= 400) {
      throw buildApiError('scanCard', response, payload);
    }

    return parseScanEnvelope(payload);
  }

  async updateCard(
    accessToken: string,
    cardId: string,
    input: Partial<{
      name: string;
      title: string;
      company: string;
      email: string;
      phone: string;
      address: string;
      website: string;
      notes: string;
      tags: string[];
    }>
  ): Promise<CardRecord> {
    const { response, payload } = await this.invoke(`/v1/cards/${cardId}`, 'PATCH', {
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: input,
    });

    if (response.statusCode >= 400) {
      throw buildApiError('updateCard', response, payload);
    }

    return parseUpdateCardEnvelope(payload).card;
  }

  async listCards(accessToken: string): Promise<CardRecord[]> {
    const { response, payload } = await this.invoke('/v1/cards', 'GET', {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.statusCode >= 400) {
      throw buildApiError('listCards', response, payload);
    }

    return parseListCardsEnvelope(payload).cards;
  }

  async searchCards(
    accessToken: string,
    input: { query: string; tags?: string[] }
  ): Promise<CardRecord[]> {
    const query = new URLSearchParams();
    query.set('q', input.query);
    if (input.tags?.length) {
      query.set('tags', input.tags.join(','));
    }

    const { response, payload } = await this.invoke(`/v1/cards/search?${query.toString()}`, 'GET', {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.statusCode >= 400) {
      throw buildApiError('searchCards', response, payload);
    }

    return parseSearchCardsEnvelope(payload);
  }

  private async invoke(
    path: string,
    method: string,
    options: {
      body?: unknown;
      headers?: Record<string, string>;
      query?: Record<string, string | number | boolean | undefined>;
    } = {}
  ): Promise<LambdaInvocationResult> {
    const service = resolveServiceFromPath(path);
    const event = buildLambdaEvent({
      method,
      path,
      headers: options.headers,
      query: options.query,
      body: options.body,
    });

    return invokeLambda(service, event);
  }
}

class DryRunClient implements ApiClient {
  async registerUser(): Promise<AuthSession> {
    throw new Error('API client invoked during dry-run');
  }
  async login(): Promise<AuthSession> {
    throw new Error('API client invoked during dry-run');
  }
  async getProfile(): Promise<{ email: string }> {
    throw new Error('API client invoked during dry-run');
  }
  async createUpload(): Promise<UploadRecord> {
    throw new Error('API client invoked during dry-run');
  }
  async completeUpload(): Promise<UploadRecord> {
    throw new Error('API client invoked during dry-run');
  }
  async scanCard(): Promise<{ card: CardRecord; ocrJobId: string; enrichmentId: string }> {
    throw new Error('API client invoked during dry-run');
  }
  async updateCard(): Promise<CardRecord> {
    throw new Error('API client invoked during dry-run');
  }
  async listCards(): Promise<CardRecord[]> {
    throw new Error('API client invoked during dry-run');
  }
  async searchCards(): Promise<CardRecord[]> {
    throw new Error('API client invoked during dry-run');
  }
}

class NotImplementedClient implements ApiClient {
  constructor(private readonly env: RunEnvironment) {}

  async registerUser(): Promise<AuthSession> {
    throw new Error(`API client not implemented for environment ${this.env}`);
  }
  async login(): Promise<AuthSession> {
    throw new Error(`API client not implemented for environment ${this.env}`);
  }
  async getProfile(): Promise<{ email: string }> {
    throw new Error(`API client not implemented for environment ${this.env}`);
  }
  async createUpload(): Promise<UploadRecord> {
    throw new Error(`API client not implemented for environment ${this.env}`);
  }
  async completeUpload(): Promise<UploadRecord> {
    throw new Error(`API client not implemented for environment ${this.env}`);
  }
  async scanCard(): Promise<{ card: CardRecord; ocrJobId: string; enrichmentId: string }> {
    throw new Error(`API client not implemented for environment ${this.env}`);
  }
  async updateCard(): Promise<CardRecord> {
    throw new Error(`API client not implemented for environment ${this.env}`);
  }
  async listCards(): Promise<CardRecord[]> {
    throw new Error(`API client not implemented for environment ${this.env}`);
  }
  async searchCards(): Promise<CardRecord[]> {
    throw new Error(`API client not implemented for environment ${this.env}`);
  }
}

export async function createApiClient(env: RunEnvironment, dryRun: boolean): Promise<ApiClient> {
  if (dryRun) {
    return new DryRunClient();
  }

  if (env === 'local') {
    process.env['DATABASE_URL'] ||=
      'postgresql://namecard_user:namecard_password@localhost:5432/namecard_dev';
    await ensureSharedBuild();
    return new LocalLambdaClient();
  }

  return new NotImplementedClient(env);
}

async function ensureSharedBuild(): Promise<void> {
  const distIndex = path.join(repoRoot, 'services', 'shared', 'dist', 'index.js');
  try {
    await fs.access(distIndex);
  } catch {
    throw new Error(
      'Missing services/shared build output. Run `pnpm --filter @namecard/shared run build` before executing API e2e tests.'
    );
  }
}

function buildApiError(operation: string, response: LambdaHttpResponse, payload: unknown): Error {
  const payloadRecord = payload as Record<string, unknown> | undefined;
  const errorContainer = payloadRecord?.['error'] as Record<string, unknown> | undefined;
  const errorMessage =
    (errorContainer?.['message'] as string | undefined) ||
    (payloadRecord?.['message'] as string | undefined) ||
    'Unknown error';
  const details = JSON.stringify(payloadRecord ?? {}, null, 2);
  return new Error(
    `${operation} failed with status ${response.statusCode}: ${errorMessage}\nPayload: ${details}`
  );
}

const sessionEnvelopeSchema = z.object({
  data: z.object({
    user: z.object({
      id: z.string(),
      email: z.string().email(),
    }),
    session: z.object({
      accessToken: z.string(),
      refreshToken: z.string(),
      expiresAt: z.string().optional(),
    }),
  }),
});

const uploadSchema = z
  .object({
    id: z.string(),
    fileName: z.string(),
    contentType: z.string(),
    size: z.number(),
    status: z.string(),
    presignedUrl: z.string(),
    cdnUrl: z.string(),
    checksum: z.string(),
  })
  .passthrough();

const uploadEnvelopeSchema = z.object({
  data: z.object({
    upload: uploadSchema,
  }),
});

const cardSchema = z
  .object({
    id: z.string(),
    name: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    company: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    tags: z.array(z.string()).optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .passthrough();

const scanEnvelopeSchema = z.object({
  data: z.object({
    card: cardSchema,
    ocrJobId: z.string(),
    enrichmentId: z.string(),
  }),
});

const updateCardEnvelopeSchema = z.object({
  data: z.object({
    card: cardSchema,
  }),
});

const listCardsEnvelopeSchema = z.object({
  data: z.object({
    cards: z.array(cardSchema),
  }),
});

const searchCardsEnvelopeSchema = z.object({
  data: z.object({
    results: z.array(
      z.object({
        item: cardSchema,
        rank: z.number(),
        highlights: z.string().nullable(),
      })
    ),
  }),
});

const profileEnvelopeSchema = z.object({
  data: z.object({
    profile: z.object({
      email: z.string().email(),
    }),
  }),
});

function parseSessionEnvelope(payload: unknown) {
  const result = sessionEnvelopeSchema.safeParse(payload);
  if (!result.success) {
    throw new Error(`Unexpected session payload: ${result.error.message}`);
  }
  return result.data.data;
}

function parseProfileEnvelope(payload: unknown) {
  const result = profileEnvelopeSchema.safeParse(payload);
  if (!result.success) {
    throw new Error(`Unexpected profile payload: ${result.error.message}`);
  }
  return result.data.data.profile;
}

function parseUploadEnvelope(payload: unknown): { upload: UploadRecord } {
  const result = uploadEnvelopeSchema.safeParse(payload);
  if (!result.success) {
    throw new Error(`Unexpected upload payload: ${result.error.message}`);
  }
  const upload = result.data.data.upload;
  return {
    upload: {
      id: upload.id,
      fileName: upload.fileName,
      contentType: upload.contentType,
      size: upload.size,
      status: upload.status,
      presignedUrl: upload.presignedUrl,
      cdnUrl: upload.cdnUrl,
      checksum: upload.checksum,
    },
  };
}

function parseScanEnvelope(payload: unknown): {
  card: CardRecord;
  ocrJobId: string;
  enrichmentId: string;
} {
  const result = scanEnvelopeSchema.safeParse(payload);
  if (!result.success) {
    throw new Error(`Unexpected scan payload: ${result.error.message}`);
  }
  const { card, ocrJobId, enrichmentId } = result.data.data;
  return {
    card: normalizeCard(card),
    ocrJobId,
    enrichmentId,
  };
}

function parseUpdateCardEnvelope(payload: unknown): { card: CardRecord } {
  const result = updateCardEnvelopeSchema.safeParse(payload);
  if (!result.success) {
    throw new Error(`Unexpected update payload: ${result.error.message}`);
  }
  return { card: normalizeCard(result.data.data.card) };
}

function parseListCardsEnvelope(payload: unknown): { cards: CardRecord[] } {
  const result = listCardsEnvelopeSchema.safeParse(payload);
  if (!result.success) {
    throw new Error(`Unexpected list payload: ${result.error.message}`);
  }
  return {
    cards: result.data.data.cards.map(normalizeCard),
  };
}

function parseSearchCardsEnvelope(payload: unknown): CardRecord[] {
  const result = searchCardsEnvelopeSchema.safeParse(payload);
  if (!result.success) {
    throw new Error(`Unexpected search payload: ${result.error.message}`);
  }
  return result.data.data.results.map(item => normalizeCard(item.item));
}

function normalizeCard(card: z.infer<typeof cardSchema>): CardRecord {
  return {
    id: card.id,
    name: card.name ?? null,
    title: card.title ?? null,
    company: card.company ?? null,
    email: card.email ?? null,
    phone: card.phone ?? null,
    tags: Array.isArray(card.tags) ? [...card.tags] : [],
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
  };
}
