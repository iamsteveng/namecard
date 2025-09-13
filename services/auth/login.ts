import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import type { LoginResponse } from '@namecard/shared';

import {
  getPrismaClient,
  logger,
  createSuccessResponse,
  createErrorResponse,
  parseJsonBody,
  getRequestId,
  cognitoService,
} from '@shared/index';

interface LoginRequest {
  email: string;
  password: string;
}

// Validation function for login data
function validateLoginData(data: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data?.email || typeof data.email !== 'string') {
    errors.push('Email is required and must be a string');
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.push('Email must be a valid email address');
  }

  if (!data?.password || typeof data.password !== 'string') {
    errors.push('Password is required and must be a string');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  const startTime = Date.now();
  const requestId = getRequestId(event);

  logger.logRequest('POST', '/auth/login', {
    requestId,
    functionName: context.functionName,
  });

  try {
    // Parse request body
    const body = parseJsonBody(event.body);
    if (!body) {
      return createErrorResponse('Invalid request body', 400, requestId);
    }

    // Validate request data
    const validation = validateLoginData(body);
    if (!validation.isValid) {
      return createErrorResponse(
        `Validation failed: ${validation.errors.join(', ')}`,
        400,
        requestId
      );
    }

    const { email, password }: LoginRequest = body;

    // Get Prisma client
    const prisma = await getPrismaClient();

    logger.info('User login attempt', { email, requestId });

    // Authenticate with Cognito
    const authResult = await cognitoService.authenticateUser(email, password);

    if (authResult.challengeName) {
      // Handle auth challenges (e.g., force password change)
      return createSuccessResponse(
        {
          requiresChallenge: true,
          challengeName: authResult.challengeName,
          session: authResult.session,
        },
        200,
        'Authentication challenge required',
        requestId
      );
    }

    // Get or update user in our database
    let user = await prisma.user.findUnique({
      where: { cognitoId: authResult.user.sub },
    });

    if (!user) {
      // Create user if doesn't exist (shouldn't happen normally)
      user = await prisma.user.create({
        data: {
          cognitoId: authResult.user.sub,
          email: authResult.user.email,
          name: authResult.user.name || null,
          preferences: {},
        },
      });
      logger.info('Created user during login', { userId: user.id, requestId });
    } else {
      // Update user info if changed
      const needsUpdate =
        user.email !== authResult.user.email || user.name !== authResult.user.name;

      if (needsUpdate) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            email: authResult.user.email,
            name: authResult.user.name || null,
          },
        });
        logger.info('Updated user during login', { userId: user.id, requestId });
      }
    }

    logger.info('User logged in successfully', {
      userId: user.id,
      email: user.email,
      requestId,
    });

    const response: LoginResponse = {
      success: true,
      data: {
        user: {
          id: user.id,
          cognitoId: user.cognitoId,
          email: user.email,
          name: user.name || undefined,
          avatarUrl: user.avatarUrl || undefined,
          preferences: user.preferences as any,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        session: {
          user: {
            id: user.id,
            cognitoId: user.cognitoId,
            email: user.email,
            name: user.name || undefined,
            avatarUrl: user.avatarUrl || undefined,
            preferences: user.preferences as any,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          },
          accessToken: authResult.accessToken,
          refreshToken: authResult.refreshToken,
          expiresAt: new Date(Date.now() + authResult.expiresIn * 1000),
        },
      },
      message: 'Login successful',
    };

    const duration = Date.now() - startTime;
    logger.logResponse(200, duration, { requestId, functionName: context.functionName });

    return createSuccessResponse(response.data, 200, response.message, requestId);
  } catch (error: any) {
    const duration = Date.now() - startTime;
    const { email } = parseJsonBody(event.body) || {};
    
    logger.error('Login failed', error, { email, requestId });

    // Handle Cognito-specific errors
    let statusCode = 401;
    let message = 'Login failed. Please try again.';

    if (error.message.includes('NotAuthorizedException')) {
      message = 'Invalid email or password';
    } else if (error.message.includes('UserNotConfirmedException')) {
      message = 'Account not verified. Please check your email.';
    } else if (error.message.includes('UserNotFoundException')) {
      message = 'Invalid email or password';
    } else if (error.message.includes('TooManyRequestsException')) {
      statusCode = 429;
      message = 'Too many login attempts. Please try again later.';
    }

    logger.logResponse(statusCode, duration, { requestId, functionName: context.functionName });
    return createErrorResponse(message, statusCode, requestId);
  }
};