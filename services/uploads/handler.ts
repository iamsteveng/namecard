import { mockDb } from '@namecard/shared';
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
  const analytics = mockDb.getSearchAnalytics();

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

const handleCreatePresign = (event: LambdaHttpEvent, requestId: string) => {
  try {
    const user = requireAuthenticatedUser(event);
    const body = parseBody<{
      fileName?: string;
      checksum?: string;
      contentType?: string;
      size?: number;
    }>(event);

    if (!body.fileName || !body.checksum || !body.contentType || !body.size) {
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
      return withCors(error as any);
    }
    const message = error instanceof Error ? error.message : 'Unable to create presign URL';
    return withCors(createErrorResponse(500, message));
  }
};

const handleCompleteUpload = (event: LambdaHttpEvent, requestId: string) => {
  try {
    void requireAuthenticatedUser(event);
    const body = parseBody<{ uploadId?: string }>(event);

    if (!body.uploadId) {
      return withCors(createErrorResponse(400, 'uploadId is required', { code: 'INVALID_INPUT' }));
    }

    const upload = mockDb.completeUpload(body.uploadId);

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
    return withCors(createErrorResponse(500, message));
  }
};

const handleGetUpload = (event: LambdaHttpEvent, requestId: string, uploadId: string) => {
  try {
    void requireAuthenticatedUser(event);
    const upload = mockDb.getUpload(uploadId);

    if (!upload) {
      return withCors(createErrorResponse(404, 'Upload not found', { code: 'NOT_FOUND' }));
    }

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
    return withCors(createErrorResponse(500, message));
  }
};

const handleListUploads = (event: LambdaHttpEvent, requestId: string) => {
  try {
    void requireAuthenticatedUser(event);
    const uploads = mockDb.getUpload('upload-demo-001');

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

  if (segments.length < 2 || segments[0] !== 'v1' || segments[1] !== 'uploads') {
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

  return withCors(createErrorResponse(405, 'Method not allowed', { code: 'METHOD_NOT_ALLOWED' }));
};
