import { mockDb } from '@namecard/shared';
import {
  createErrorResponse,
  createSuccessResponse,
  extractBearerToken,
  getPathSegments,
  getRequestId,
  parseJsonBody,
  withCors,
  type LambdaHttpEvent,
} from '@namecard/shared';

const SUPPORTED_METHODS = ['GET', 'POST', 'OPTIONS'];

const buildCorsResponse = (statusCode = 204) =>
  withCors({
    statusCode,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': SUPPORTED_METHODS.join(', '),
      'access-control-allow-headers': '*',
    },
    body: '',
  });

const requireAuthenticatedUser = (event: LambdaHttpEvent) => {
  const token = extractBearerToken(event);
  if (!token) {
    throw createErrorResponse(401, 'Authorization token missing', { code: 'UNAUTHORIZED' });
  }

  const user = mockDb.getUserForToken(token);
  if (!user) {
    throw createErrorResponse(401, 'Invalid or expired access token', { code: 'UNAUTHORIZED' });
  }

  return user;
};

const parseBody = <T>(event: LambdaHttpEvent) => {
  const result = parseJsonBody<T>(event.body);
  if (!result.success) {
    throw createErrorResponse(400, 'Invalid JSON payload', {
      code: 'INVALID_JSON',
      details: { error: result.error },
    });
  }

  return (result.data ?? {}) as T;
};

const handleHealth = (requestId: string) => {
  const analytics = mockDb.getSearchAnalytics();

  return withCors(
    createSuccessResponse(
      {
        service: 'enrichment',
        status: 'ok',
        requestId,
        metrics: {
          processedCards: analytics.cardsIndexed,
          averageLatencyMs: 1450,
          thirdPartyIntegrations: ['perplexity', 'clearbit', 'news-api'],
        },
        queues: {
          enrichment: 'nominal',
        },
      },
      { message: 'Enrichment service healthy' }
    )
  );
};

const handleCreateForCard = (event: LambdaHttpEvent, requestId: string, cardId: string) => {
  try {
    const user = requireAuthenticatedUser(event);
    const body = parseBody<{ companyId?: string }>(event);

    const enrichment = mockDb.createEnrichment(cardId, {
      requestedBy: user.id,
      companyId: body.companyId,
    });

    return withCors(
      createSuccessResponse(
        {
          requestId,
          enrichment,
        },
        { message: 'Card enrichment completed', statusCode: 201 }
      )
    );
  } catch (error) {
    if ('statusCode' in (error as any)) {
      return withCors(error as any);
    }
    const message = error instanceof Error ? error.message : 'Unable to enrich card';
    return withCors(createErrorResponse(500, message));
  }
};

const handleGetForCard = (event: LambdaHttpEvent, requestId: string, cardId: string) => {
  try {
    void requireAuthenticatedUser(event);
    const enrichment = mockDb.getEnrichmentByCard(cardId);

    if (!enrichment) {
      return withCors(createErrorResponse(404, 'Enrichment not found', { code: 'NOT_FOUND' }));
    }

    return withCors(
      createSuccessResponse(
        {
          requestId,
          enrichment,
        },
        { message: 'Card enrichment retrieved' }
      )
    );
  } catch (error) {
    if ('statusCode' in (error as any)) {
      return withCors(error as any);
    }
    const message = error instanceof Error ? error.message : 'Unable to fetch enrichment';
    return withCors(createErrorResponse(500, message));
  }
};

const handleGetForCompany = (event: LambdaHttpEvent, requestId: string, companyId: string) => {
  try {
    void requireAuthenticatedUser(event);
    const enrichment = mockDb.getEnrichmentByCompany(companyId);

    if (!enrichment) {
      return withCors(createErrorResponse(404, 'Company enrichment not found', { code: 'NOT_FOUND' }));
    }

    return withCors(
      createSuccessResponse(
        {
          requestId,
          enrichment,
        },
        { message: 'Company enrichment retrieved' }
      )
    );
  } catch (error) {
    if ('statusCode' in (error as any)) {
      return withCors(error as any);
    }
    const message = error instanceof Error ? error.message : 'Unable to fetch company enrichment';
    return withCors(createErrorResponse(500, message));
  }
};

export const handler = async (event: LambdaHttpEvent) => {
  const method = event.httpMethod ?? 'GET';
  const requestId = getRequestId(event);
  const segments = getPathSegments(event);

  if (method === 'OPTIONS') {
    return buildCorsResponse();
  }

  if (segments.length < 2 || segments[0] !== 'v1' || segments[1] !== 'enrichment') {
    return withCors(createErrorResponse(404, 'Route not found', { code: 'NOT_FOUND' }));
  }

  const tail = segments.slice(2);

  if (tail.length === 0 || tail[0] === 'health') {
    return handleHealth(requestId);
  }

  if (tail[0] === 'cards' && tail[1]) {
    const cardId = tail[1];
    if (tail.length === 2 && method === 'GET') {
      return handleGetForCard(event, requestId, cardId);
    }
    if (tail.length === 2 && method === 'POST') {
      return handleCreateForCard(event, requestId, cardId);
    }
  }

  if (tail[0] === 'company' && tail[1] && method === 'GET') {
    return handleGetForCompany(event, requestId, tail[1]);
  }

  return withCors(createErrorResponse(405, 'Method not allowed', { code: 'METHOD_NOT_ALLOWED' }));
};
