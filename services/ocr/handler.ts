import { mockDb, getLogger, getMetrics, withHttpObservability } from '@namecard/shared';
import {
  createErrorResponse,
  createSuccessResponse,
  extractBearerToken,
  getPathSegments,
  getQuery,
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
  const logger = getLogger();
  const metrics = getMetrics();
  const jobs = mockDb.listOcrJobs();
  const completed = jobs.filter(job => job.status === 'completed').length;
  const pending = jobs.filter(job => job.status !== 'completed').length;

  logger.debug('ocr.health.check', { requestId, totals: { jobs: jobs.length, pending } });
  metrics.gauge('ocrPendingJobs', pending);

  return withCors(
    createSuccessResponse(
      {
        service: 'ocr',
        status: 'ok',
        requestId,
        metrics: {
          totalJobs: jobs.length,
          completed,
          pending,
          averageLatencyMs: 2100,
        },
        integrations: {
          textract: 'mocked',
          stepFunctions: 'mocked',
        },
      },
      { message: 'OCR service healthy' }
    )
  );
};

const handleListJobs = (event: LambdaHttpEvent, requestId: string) => {
  const logger = getLogger();
  const metrics = getMetrics();
  const startedAt = Date.now();
  try {
    void requireAuthenticatedUser(event);
    const query = getQuery(event);
    const cardId = query.cardId;
    const jobs = mockDb.listOcrJobs(cardId);

    metrics.duration('ocrListLatencyMs', Date.now() - startedAt);
    metrics.count('ocrListJobsReturned', jobs.length);
    logger.info('ocr.jobs.list.success', {
      requestId,
      filters: { cardId },
      returned: jobs.length,
    });

    return withCors(
      createSuccessResponse(
        {
          requestId,
          jobs,
          filters: { cardId },
        },
        { message: 'OCR jobs retrieved' }
      )
    );
  } catch (error) {
    if ('statusCode' in (error as any)) {
      return withCors(error as any);
    }
    const message = error instanceof Error ? error.message : 'Unable to list jobs';
    logger.error('ocr.jobs.list.failure', error, { requestId });
    return withCors(createErrorResponse(500, message));
  }
};

const handleCreateJob = (event: LambdaHttpEvent, requestId: string) => {
  const logger = getLogger();
  const metrics = getMetrics();
  const startedAt = Date.now();
  try {
    const user = requireAuthenticatedUser(event);
    const body = parseBody<{ cardId?: string; payload?: Record<string, any> }>(event);

    if (!body.cardId) {
      logger.warn('ocr.jobs.create.missingCardId', { requestId });
      return withCors(
        createErrorResponse(400, 'cardId is required', {
          code: 'INVALID_INPUT',
        })
      );
    }

    const job = mockDb.createOcrJob(body.cardId, {
      requestedBy: user.id,
      payload: body.payload,
    });

    metrics.count('ocrJobsCreated');
    metrics.duration('ocrJobScheduleLatencyMs', Date.now() - startedAt);
    logger.info('ocr.jobs.create.success', { requestId, jobId: job.id, cardId: body.cardId });

    return withCors(
      createSuccessResponse(
        {
          requestId,
          job,
        },
        { message: 'OCR job created', statusCode: 201 }
      )
    );
  } catch (error) {
    if ('statusCode' in (error as any)) {
      return withCors(error as any);
    }
    const message = error instanceof Error ? error.message : 'Unable to create job';
    logger.error('ocr.jobs.create.failure', error, { requestId });
    return withCors(createErrorResponse(500, message));
  }
};

const handleGetJob = (event: LambdaHttpEvent, requestId: string, jobId: string) => {
  const logger = getLogger();
  try {
    void requireAuthenticatedUser(event);
    const job = mockDb.getOcrJob(jobId);

    if (!job) {
      logger.warn('ocr.jobs.get.notFound', { requestId, jobId });
      return withCors(createErrorResponse(404, 'OCR job not found', { code: 'NOT_FOUND' }));
    }

    logger.info('ocr.jobs.get.success', { requestId, jobId });
    return withCors(
      createSuccessResponse(
        {
          requestId,
          job,
        },
        { message: 'OCR job retrieved' }
      )
    );
  } catch (error) {
    if ('statusCode' in (error as any)) {
      return withCors(error as any);
    }
    const message = error instanceof Error ? error.message : 'Unable to fetch job';
    logger.error('ocr.jobs.get.failure', error, { requestId, jobId });
    return withCors(createErrorResponse(500, message));
  }
};

const handleRequest = async (event: LambdaHttpEvent) => {
  const method = event.httpMethod ?? 'GET';
  const requestId = getRequestId(event);
  const segments = getPathSegments(event);
  const logger = getLogger();

  logger.debug('ocr.router.received', { method, path: event.rawPath, requestId });

  if (method === 'OPTIONS') {
    return buildCorsResponse();
  }

  if (segments.length < 2 || segments[0] !== 'v1' || segments[1] !== 'ocr') {
    logger.warn('ocr.router.notFound', { path: event.rawPath });
    return withCors(createErrorResponse(404, 'Route not found', { code: 'NOT_FOUND' }));
  }

  const tail = segments.slice(2);

  if (tail.length === 0) {
    return handleHealth(requestId);
  }

  if (tail[0] === 'health') {
    return handleHealth(requestId);
  }

  if (tail[0] === 'jobs') {
    if (tail.length === 1) {
      if (method === 'GET') {
        return handleListJobs(event, requestId);
      }
      if (method === 'POST') {
        return handleCreateJob(event, requestId);
      }
    }

    if (tail.length === 2 && method === 'GET') {
      return handleGetJob(event, requestId, tail[1]);
    }
  }

  logger.warn('ocr.router.unhandled', { method, path: event.rawPath });
  return withCors(createErrorResponse(405, 'Method not allowed', { code: 'METHOD_NOT_ALLOWED' }));
};

export const handler = withHttpObservability(handleRequest, { serviceName: 'ocr' });
