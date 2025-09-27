import {
  mockDb,
  getLogger,
  getMetrics,
  extractIdempotencyKey,
  withIdempotency,
  withHttpObservability,
} from '@namecard/shared';
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
  const analytics = mockDb.getSearchAnalytics();

  logger.debug('uploads.health.check', { requestId });
  metrics.gauge('uploadsActiveUrls', 1);

  return withCors(
    createSuccessResponse(
      {
        service: 'uploads',
        status: 'ok',
        requestId,
        metrics: {
          activePresignedUrls: 1,
          averageUploadSizeKb: 48,
          cardsIndexed: analytics.cardsIndexed,
        },
        storage: {
          bucket: 'mock-namecard-uploads',
          region: 'ap-southeast-1',
        },
      },
      { message: 'Uploads service healthy' }
    )
  );
};

const handleCreatePresign = async (event: LambdaHttpEvent, requestId: string) => {
  const logger = getLogger();
  const metrics = getMetrics();
  const idempotencyKey = extractIdempotencyKey(event.headers ?? {});
  const startedAt = Date.now();

  return withIdempotency(idempotencyKey, async () => {
    try {
      const user = requireAuthenticatedUser(event);
      const body = parseBody<{
        fileName?: string;
        checksum?: string;
        contentType?: string;
        size?: number;
      }>(event);

      if (!body.fileName || !body.checksum || !body.contentType || !body.size) {
        logger.warn('uploads.presign.invalidInput', { requestId });
        return withCors(
          createErrorResponse(400, 'fileName, checksum, contentType, and size are required', {
            code: 'INVALID_INPUT',
          })
        );
      }

      const upload = mockDb.createUpload({
        tenantId: mockDb.getTenantForUser(user.id),
        fileName: body.fileName,
        checksum: body.checksum,
        contentType: body.contentType,
        size: body.size,
      });

      metrics.count('uploadsPresignedCreated');
      metrics.duration('uploadsPresignLatencyMs', Date.now() - startedAt);
      logger.info('uploads.presign.success', { requestId, uploadId: upload.id });

      return withCors(
        createSuccessResponse(
          {
            requestId,
            upload,
          },
          { message: 'Presigned URL created', statusCode: 201 }
        )
      );
    } catch (error) {
      if ('statusCode' in (error as any)) {
        logger.warn('uploads.presign.errorResponse', { requestId });
        return withCors(error as any);
      }
      const message = error instanceof Error ? error.message : 'Unable to create presign URL';
      logger.error('uploads.presign.failure', error, { requestId });
      return withCors(createErrorResponse(500, message));
    }
  });
};

const handleCompleteUpload = (event: LambdaHttpEvent, requestId: string) => {
  const logger = getLogger();
  const metrics = getMetrics();
  try {
    void requireAuthenticatedUser(event);
    const body = parseBody<{ uploadId?: string }>(event);

    if (!body.uploadId) {
      logger.warn('uploads.complete.missingUploadId', { requestId });
      return withCors(createErrorResponse(400, 'uploadId is required', { code: 'INVALID_INPUT' }));
    }

    const upload = mockDb.completeUpload(body.uploadId);

    metrics.count('uploadsCompleted');
    logger.info('uploads.complete.success', { requestId, uploadId: body.uploadId });

    return withCors(
      createSuccessResponse(
        {
          requestId,
          upload,
        },
        { message: 'Upload marked complete' }
      )
    );
  } catch (error) {
    if ('statusCode' in (error as any)) {
      return withCors(error as any);
    }
    const message = error instanceof Error ? error.message : 'Unable to complete upload';
    logger.error('uploads.complete.failure', error, { requestId });
    return withCors(createErrorResponse(500, message));
  }
};

const handleGetUpload = (event: LambdaHttpEvent, requestId: string, uploadId: string) => {
  const logger = getLogger();
  try {
    void requireAuthenticatedUser(event);
    const upload = mockDb.getUpload(uploadId);

    if (!upload) {
      logger.warn('uploads.get.notFound', { requestId, uploadId });
      return withCors(createErrorResponse(404, 'Upload not found', { code: 'NOT_FOUND' }));
    }

    logger.info('uploads.get.success', { requestId, uploadId });
    return withCors(
      createSuccessResponse(
        {
          requestId,
          upload,
        },
        { message: 'Upload retrieved' }
      )
    );
  } catch (error) {
    if ('statusCode' in (error as any)) {
      return withCors(error as any);
    }
    const message = error instanceof Error ? error.message : 'Unable to fetch upload';
    logger.error('uploads.get.failure', error, { requestId, uploadId });
    return withCors(createErrorResponse(500, message));
  }
};

const handleListUploads = (event: LambdaHttpEvent, requestId: string) => {
  const logger = getLogger();
  try {
    void requireAuthenticatedUser(event);
    const uploads = mockDb.getUpload('upload-demo-001');

    logger.debug('uploads.list.success', { requestId, count: uploads ? 1 : 0 });

    return withCors(
      createSuccessResponse(
        {
          requestId,
          uploads: uploads ? [uploads] : [],
        },
        { message: 'Uploads listing retrieved' }
      )
    );
  } catch (error) {
    if ('statusCode' in (error as any)) {
      return withCors(error as any);
    }
    const message = error instanceof Error ? error.message : 'Unable to list uploads';
    logger.error('uploads.list.failure', error, { requestId });
    return withCors(createErrorResponse(500, message));
  }
};

const handleRequest = async (event: LambdaHttpEvent) => {
  const method = event.httpMethod ?? 'GET';
  const requestId = getRequestId(event);
  const segments = getPathSegments(event);
  const logger = getLogger();

  logger.debug('uploads.router.received', { method, path: event.rawPath, requestId });

  if (method === 'OPTIONS') {
    return buildCorsResponse();
  }

  if (segments.length < 2 || segments[0] !== 'v1' || segments[1] !== 'uploads') {
    logger.warn('uploads.router.notFound', { path: event.rawPath });
    return withCors(createErrorResponse(404, 'Route not found', { code: 'NOT_FOUND' }));
  }

  const tail = segments.slice(2);

  if (tail.length === 0) {
    if (method === 'GET') {
      return handleListUploads(event, requestId);
    }
    if (method === 'POST') {
      return handleCreatePresign(event, requestId);
    }
  }

  if (tail[0] === 'health') {
    return handleHealth(requestId);
  }

  if (tail[0] === 'presign' && method === 'POST') {
    return handleCreatePresign(event, requestId);
  }

  if (tail[0] === 'complete' && method === 'POST') {
    return handleCompleteUpload(event, requestId);
  }

  if (tail.length === 1 && method === 'GET') {
    return handleGetUpload(event, requestId, tail[0]);
  }

  logger.warn('uploads.router.unhandled', { method, path: event.rawPath });
  return withCors(createErrorResponse(405, 'Method not allowed', { code: 'METHOD_NOT_ALLOWED' }));
};

export const handler = withHttpObservability(handleRequest, { serviceName: 'uploads' });
