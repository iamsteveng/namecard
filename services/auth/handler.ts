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

const METHOD_NOT_ALLOWED = ['GET', 'POST', 'OPTIONS'];

const buildCorsResponse = (statusCode = 204) =>
  withCors({
    statusCode,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': METHOD_NOT_ALLOWED.join(', '),
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

const handleHealth = (requestId: string) => {
  const response = createSuccessResponse({
    service: 'auth',
    status: 'ok',
    requestId,
    environment: 'mock',
    dependencies: {
      cognito: 'available',
      database: 'available',
      secrets: 'available',
    },
    metrics: {
      activeSessions: 1,
      knownUsers: 1,
      averageLatencyMs: 35,
    },
  });

  return withCors(response);
};

const handleLogin = (event: LambdaHttpEvent, requestId: string) => {
  const body = parseBody<{ email?: string; password?: string }>(event);

  if (!body.email || !body.password) {
    return withCors(
      createErrorResponse(400, 'Email and password are required', {
        code: 'INVALID_INPUT',
      })
    );
  }

  try {
    const { user, accessToken, refreshToken, expiresAt } = mockDb.authenticate(
      body.email,
      body.password
    );

    return withCors(
      createSuccessResponse(
        {
          user,
          session: {
            accessToken,
            refreshToken,
            expiresAt,
          },
          requestId,
        },
        { message: 'Login successful' }
      )
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Authentication failed';
    return withCors(
      createErrorResponse(401, message, {
        code: 'INVALID_CREDENTIALS',
      })
    );
  }
};

const handleRegister = (event: LambdaHttpEvent, requestId: string) => {
  const body = parseBody<{ email?: string; password?: string; name?: string }>(event);

  if (!body.email || !body.password || !body.name) {
    return withCors(
      createErrorResponse(400, 'Name, email, and password are required', {
        code: 'INVALID_INPUT',
      })
    );
  }

  try {
    const { user, accessToken, refreshToken, expiresAt } = mockDb.register({
      email: body.email,
      password: body.password,
      name: body.name,
    });

    return withCors(
      createSuccessResponse(
        {
          user,
          session: {
            accessToken,
            refreshToken,
            expiresAt,
          },
          requestId,
        },
        {
          message: 'Registration successful',
          statusCode: 201,
        }
      )
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    return withCors(
      createErrorResponse(409, message, {
        code: 'DUPLICATE_EMAIL',
      })
    );
  }
};

const handleProfile = (event: LambdaHttpEvent, requestId: string) => {
  try {
    const { user } = requireAuthenticatedUser(event);
    const profile = mockDb.getUserProfile(user.id);
    const stats = mockDb.getCardStats(user.id);

    return withCors(
      createSuccessResponse(
        {
          profile,
          stats,
          requestId,
        },
        { message: 'Profile retrieved' }
      )
    );
  } catch (error) {
    if ('statusCode' in (error as any)) {
      return withCors(error as any);
    }
    const message = error instanceof Error ? error.message : 'Unable to fetch profile';
    return withCors(createErrorResponse(500, message));
  }
};

const handleRefresh = (event: LambdaHttpEvent, requestId: string) => {
  const body = parseBody<{ refreshToken?: string }>(event);
  if (!body.refreshToken) {
    return withCors(
      createErrorResponse(400, 'Refresh token is required', {
        code: 'INVALID_INPUT',
      })
    );
  }

  try {
    const refreshed = mockDb.refresh(body.refreshToken);
    return withCors(
      createSuccessResponse(
        {
          requestId,
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          expiresAt: refreshed.expiresAt,
        },
        {
          message: 'Session refreshed',
        }
      )
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to refresh session';
    return withCors(
      createErrorResponse(401, message, {
        code: 'TOKEN_INVALID',
      })
    );
  }
};

const handleLogout = (event: LambdaHttpEvent, requestId: string) => {
  try {
    const { token } = requireAuthenticatedUser(event);
    mockDb.revoke(token);
    return withCors(
      createSuccessResponse(
        { requestId },
        {
          message: 'Logout successful',
        }
      )
    );
  } catch (error) {
    if ('statusCode' in (error as any)) {
      return withCors(error as any);
    }
    const message = error instanceof Error ? error.message : 'Unable to logout';
    return withCors(createErrorResponse(500, message));
  }
};

const handleRoutesCatalog = (requestId: string) => {
  return withCors(
    createSuccessResponse(
      {
        requestId,
        routes: [
          { method: 'GET', path: '/v1/auth/health', description: 'Service health status' },
          { method: 'POST', path: '/v1/auth/login', description: 'Authenticate user and issue tokens' },
          { method: 'POST', path: '/v1/auth/register', description: 'Create a new tenant user' },
          { method: 'POST', path: '/v1/auth/refresh', description: 'Refresh access token' },
          { method: 'POST', path: '/v1/auth/logout', description: 'Invalidate the current session' },
          { method: 'GET', path: '/v1/auth/profile', description: 'Retrieve current user profile' },
        ],
      },
      { message: 'Auth service routes' }
    )
  );
};

export const handler = async (event: LambdaHttpEvent) => {
  const method = event.httpMethod ?? 'GET';
  const requestId = getRequestId(event);
  const segments = getPathSegments(event);

  if (method === 'OPTIONS') {
    return buildCorsResponse();
  }

  if (segments.length < 2 || segments[0] !== 'v1' || segments[1] !== 'auth') {
    return withCors(createErrorResponse(404, 'Route not found', { code: 'NOT_FOUND' }));
  }

  const tail = segments.slice(2);

  if (method === 'GET' && tail.length === 0) {
    const query = getQuery(event);
    if (query.catalog === 'true') {
      return handleRoutesCatalog(requestId);
    }
    return handleHealth(requestId);
  }

  if (method === 'GET' && tail[0] === 'health') {
    return handleHealth(requestId);
  }

  if (method === 'GET' && tail[0] === 'profile') {
    return handleProfile(event, requestId);
  }

  if (method === 'POST' && tail[0] === 'login') {
    return handleLogin(event, requestId);
  }

  if (method === 'POST' && tail[0] === 'register') {
    return handleRegister(event, requestId);
  }

  if (method === 'POST' && tail[0] === 'refresh') {
    return handleRefresh(event, requestId);
  }

  if (method === 'POST' && tail[0] === 'logout') {
    return handleLogout(event, requestId);
  }

  return withCors(createErrorResponse(405, 'Method not allowed', { code: 'METHOD_NOT_ALLOWED' }));
};
