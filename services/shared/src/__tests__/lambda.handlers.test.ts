import { handler as authHandler } from '../../../auth/handler';
import { handler as cardsHandler } from '../../../cards/handler';
import { handler as searchHandler } from '../../../search/handler';
import { handler as uploadsHandler } from '../../../uploads/handler';
import { handler as ocrHandler } from '../../../ocr/handler';
import { handler as enrichmentHandler } from '../../../enrichment/handler';
import { seedDemoWorkspace, disconnectPrisma } from '@namecard/shared';
import type { LambdaHttpEvent } from '@namecard/shared';

const baseEvent: LambdaHttpEvent = {
  httpMethod: 'GET',
  rawPath: '/',
  headers: {},
  queryStringParameters: null,
  pathParameters: null,
  body: null,
  requestContext: { requestId: 'jest-request' },
};

const createEvent = (overrides: Partial<LambdaHttpEvent>): LambdaHttpEvent => ({
  ...baseEvent,
  ...overrides,
  headers: { ...baseEvent.headers, ...overrides.headers },
  requestContext: overrides.requestContext ?? baseEvent.requestContext,
});

const parseBody = <T>(responseBody: string): T => JSON.parse(responseBody) as T;

const loginAndGetToken = async (): Promise<string> => {
  const loginResponse = await authHandler(
    createEvent({
      httpMethod: 'POST',
      rawPath: '/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'demo@namecard.app',
        password: 'DemoPass123!',
      }),
    })
  );

  expect(loginResponse.statusCode).toBe(200);
  const payload = parseBody<{ data: { session: { accessToken: string } } }>(loginResponse.body);
  return payload.data.session.accessToken;
};

const shouldSkipIntegration = process.env.CI === 'true' && process.env.RUN_DB_TESTS !== 'true';

(shouldSkipIntegration ? describe.skip : describe)('Lambda service handlers', () => {
  beforeEach(async () => {
    await seedDemoWorkspace({ reset: true });
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('executes a card ingestion flow across services', async () => {
    const token = await loginAndGetToken();

    const scanResponse = await cardsHandler(
      createEvent({
        httpMethod: 'POST',
        rawPath: '/v1/cards/scan',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          fileName: 'networking-card.png',
          tags: ['conference'],
        }),
      })
    );

    expect(scanResponse.statusCode).toBe(201);
    const scanPayload = parseBody<{
      data: { card: { id: string } };
    }>(scanResponse.body);
    const { card } = scanPayload.data;

    const listResponse = await cardsHandler(
      createEvent({
        httpMethod: 'GET',
        rawPath: '/v1/cards',
        headers: { authorization: `Bearer ${token}` },
        queryStringParameters: { limit: '10' },
      })
    );
    expect(listResponse.statusCode).toBe(200);
    const listPayload = parseBody<{ data: { cards: Array<{ id: string }> } }>(listResponse.body);
    expect(listPayload.data.cards.some(item => item.id === card.id)).toBe(true);

    const ocrJobsResponse = await ocrHandler(
      createEvent({
        httpMethod: 'GET',
        rawPath: '/v1/ocr/jobs',
        headers: { authorization: `Bearer ${token}` },
        queryStringParameters: { cardId: card.id },
      })
    );
    expect(ocrJobsResponse.statusCode).toBe(200);
    const ocrJobsPayload = parseBody<{ data: { jobs: Array<{ cardId: string }> } }>(
      ocrJobsResponse.body
    );
    expect(ocrJobsPayload.data.jobs[0].cardId).toBe(card.id);

    const enrichmentResponse = await enrichmentHandler(
      createEvent({
        httpMethod: 'GET',
        rawPath: `/v1/enrichment/cards/${card.id}`,
        headers: { authorization: `Bearer ${token}` },
      })
    );
    expect(enrichmentResponse.statusCode).toBe(200);
    const enrichmentPayload = parseBody<{
      data: { enrichment: { cardId: string } };
    }>(enrichmentResponse.body);
    expect(enrichmentPayload.data.enrichment.cardId).toBe(card.id);

    const presignResponse = await uploadsHandler(
      createEvent({
        httpMethod: 'POST',
        rawPath: '/v1/uploads/presign',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          fileName: 'card-image.png',
          checksum: 'abc123',
          contentType: 'image/png',
          size: 1024,
        }),
      })
    );
    expect(presignResponse.statusCode).toBe(201);
    const presignPayload = parseBody<{ data: { upload: { id: string } } }>(presignResponse.body);

    const completeResponse = await uploadsHandler(
      createEvent({
        httpMethod: 'POST',
        rawPath: '/v1/uploads/complete',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ uploadId: presignPayload.data.upload.id }),
      })
    );
    expect(completeResponse.statusCode).toBe(200);

    const searchResponse = await searchHandler(
      createEvent({
        httpMethod: 'POST',
        rawPath: '/v1/search/query',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ query: 'Scanned', includeCompanies: false }),
      })
    );
    expect(searchResponse.statusCode).toBe(200);
    const searchPayload = parseBody<{
      data: { cards: Array<{ id: string }> };
    }>(searchResponse.body);
    expect(searchPayload.data.cards.some(item => item.id === card.id)).toBe(true);
  });
});
