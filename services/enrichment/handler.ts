import {
  getLogger,
  getMetrics,
  withHttpObservability,
  resolveUserFromToken,
  createEnrichment,
  getEnrichmentByCard,
  getEnrichmentByCompany,
  getSearchAnalytics,
  ensureDefaultDemoUser,
  ensureDatabaseUrl,
} from '@namecard/shared';
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

const requireAuthenticatedUser = async (event: LambdaHttpEvent) => {
  const token = extractBearerToken(event);
  if (!token) {
    throw createErrorResponse(401, 'Authorization token missing', { code: 'UNAUTHORIZED' });
  }

  const user = await resolveUserFromToken(token);
  if (!user) {
    throw createErrorResponse(401, 'Invalid or expired access token', { code: 'UNAUTHORIZED' });
  }

  return { user, token } as const;
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

const handleHealth = async (requestId: string) => {
  const logger = getLogger();
  const metrics = getMetrics();
  await ensureDefaultDemoUser();
  const analytics = await getSearchAnalytics().catch(
    () =>
      ({
        cardsIndexed: 0,
      }) as any
  );

  logger.debug('enrichment.health.check', { requestId });
  metrics.gauge('enrichmentProcessedCards', analytics.cardsIndexed);

  return withCors(
    createSuccessResponse(
      {
        service: 'enrichment',
        status: 'ok',
        requestId,
        metrics: {
          processedCards: analytics.cardsIndexed ?? 0,
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

const handleCreateForCard = async (event: LambdaHttpEvent, requestId: string, cardId: string) => {
  const logger = getLogger();
  const metrics = getMetrics();
  const startedAt = Date.now();
  try {
    const { user } = await requireAuthenticatedUser(event);
    const body = parseBody<{ companyId?: string }>(event);

    const enrichment = await createEnrichment(cardId, {
      requestedBy: user.id,
      companyId: body.companyId,
    });

    metrics.count('enrichmentRequests');
    metrics.duration('enrichmentLatencyMs', Date.now() - startedAt);
    logger.info('enrichment.card.success', { requestId, cardId, companyId: body.companyId });

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
    logger.error('enrichment.card.failure', error, { requestId, cardId });
    return withCors(createErrorResponse(500, message));
  }
};

const handleGetForCard = async (event: LambdaHttpEvent, requestId: string, cardId: string) => {
  const logger = getLogger();
  try {
    await requireAuthenticatedUser(event);
    const enrichment = await getEnrichmentByCard(cardId);

    if (!enrichment) {
      logger.warn('enrichment.card.notFound', { requestId, cardId });
      return withCors(createErrorResponse(404, 'Enrichment not found', { code: 'NOT_FOUND' }));
    }

    logger.info('enrichment.card.retrieved', { requestId, cardId });
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
    logger.error('enrichment.card.failure', error, { requestId, cardId });
    return withCors(createErrorResponse(500, message));
  }
};

const handleGetForCompany = async (
  event: LambdaHttpEvent,
  requestId: string,
  companyId: string
) => {
  const logger = getLogger();
  try {
    await requireAuthenticatedUser(event);
    const enrichment = await getEnrichmentByCompany(companyId);

    if (!enrichment) {
      logger.warn('enrichment.company.notFound', { requestId, companyId });
      return withCors(
        createErrorResponse(404, 'Company enrichment not found', { code: 'NOT_FOUND' })
      );
    }

    logger.info('enrichment.company.retrieved', { requestId, companyId });
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
    logger.error('enrichment.company.failure', error, { requestId, companyId });
    return withCors(createErrorResponse(500, message));
  }
};

const handleRequest = async (event: LambdaHttpEvent) => {
  await ensureDatabaseUrl();
  const method =
    (event.httpMethod ?? event.requestContext?.http?.method ?? 'GET').toUpperCase();
  const requestId = getRequestId(event);
  const segments = getPathSegments(event);
  const logger = getLogger();

  logger.debug('enrichment.router.received', { method, path: event.rawPath, requestId });

  if (method === 'OPTIONS') {
    return buildCorsResponse();
  }

  if (segments.length < 2 || segments[0] !== 'v1' || segments[1] !== 'enrichment') {
    logger.warn('enrichment.router.notFound', { path: event.rawPath });
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

  logger.warn('enrichment.router.unhandled', { method, path: event.rawPath });
  return withCors(createErrorResponse(405, 'Method not allowed', { code: 'METHOD_NOT_ALLOWED' }));
};

export const handler = withHttpObservability(handleRequest, { serviceName: 'enrichment' });
