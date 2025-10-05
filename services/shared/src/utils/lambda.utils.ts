interface LambdaRequestContext {
  requestId?: string;
  accountId?: string;
  stage?: string;
}

export interface LambdaHttpEvent {
  httpMethod?: string;
  rawPath?: string;
  path?: string;
  headers?: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined> | null;
  pathParameters?: Record<string, string | undefined> | null;
  body?: string | null;
  requestContext?: LambdaRequestContext;
}

export interface LambdaResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
};

const emptyObject: Record<string, never> = Object.freeze({});

export const getRequestId = (event: LambdaHttpEvent | undefined): string => {
  return event?.requestContext?.requestId ?? 'unknown-request';
};

export const getPath = (event: LambdaHttpEvent | undefined): string => {
  if (!event) {
    return '/';
  }
  return event.rawPath ?? event.path ?? '/';
};

export const getPathSegments = (event: LambdaHttpEvent | undefined): string[] => {
  const path = getPath(event);
  const sanitized = path.split('?')[0] ?? '';
  const segments = sanitized.split('/').filter(Boolean);
  if (segments[0] === 'api') {
    segments.shift();
  }
  return segments;
};

export const getQuery = (
  event: LambdaHttpEvent | undefined
): Record<string, string | undefined> => {
  return event?.queryStringParameters ?? emptyObject;
};

export const getPathParameters = (
  event: LambdaHttpEvent | undefined
): Record<string, string | undefined> => {
  return event?.pathParameters ?? emptyObject;
};

type ParseResult<T> = { success: true; data?: T } | { success: false; error: string };

export const parseJsonBody = <T = any>(body: string | null | undefined): ParseResult<T> => {
  if (body == null || body === '') {
    return { success: true };
  }

  try {
    return { success: true, data: JSON.parse(body) };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON payload';
    return { success: false, error: message };
  }
};

export const createResponse = (
  statusCode: number,
  payload: Record<string, unknown>,
  headers: Record<string, string> = JSON_HEADERS
): LambdaResponse => ({
  statusCode,
  headers,
  body: JSON.stringify({
    ...payload,
    timestamp: new Date().toISOString(),
  }),
});

export const createSuccessResponse = <T = unknown>(
  data: T,
  options?: { message?: string; statusCode?: number; headers?: Record<string, string> }
): LambdaResponse => {
  const statusCode = options?.statusCode ?? 200;
  const headers = options?.headers ? { ...JSON_HEADERS, ...options.headers } : JSON_HEADERS;

  return createResponse(
    statusCode,
    {
      success: true,
      data,
      message: options?.message,
    },
    headers
  );
};

export const createErrorResponse = (
  statusCode: number,
  message: string,
  options?: { code?: string; details?: unknown; headers?: Record<string, string> }
): LambdaResponse => {
  const headers = options?.headers ? { ...JSON_HEADERS, ...options.headers } : JSON_HEADERS;
  return createResponse(
    statusCode,
    {
      success: false,
      error: {
        message,
        code: options?.code,
        details: options?.details,
      },
    },
    headers
  );
};

export const extractBearerToken = (event: LambdaHttpEvent | undefined): string | undefined => {
  const header = event?.headers?.['authorization'] ?? event?.headers?.['Authorization'];
  if (!header) {
    return undefined;
  }

  const [scheme, token] = header.split(' ');
  if (!scheme || !token) {
    return undefined;
  }

  return scheme.toLowerCase() === 'bearer' ? token.trim() : undefined;
};

export const withCors = (response: LambdaResponse): LambdaResponse => ({
  ...response,
  headers: {
    ...response.headers,
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
  },
});
