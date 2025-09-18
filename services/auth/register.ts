import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import type { RegisterResponse } from '@namecard/shared';

import {
  getPrismaClient,
  logger,
  createSuccessResponse,
  createErrorResponse,
  parseJsonBody,
  getRequestId,
  cognitoService,
} from '@namecard/serverless-shared/auth-index';

interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

// Validation function for registration data
function validateRegistrationData(data: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data?.email || typeof data.email !== 'string') {
    errors.push('Email is required and must be a string');
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.push('Email must be a valid email address');
  }

  if (!data?.password || typeof data.password !== 'string') {
    errors.push('Password is required and must be a string');
  } else if (data.password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  if (!data?.name || typeof data.name !== 'string') {
    errors.push('Name is required and must be a string');
  } else if (data.name.trim().length < 1) {
    errors.push('Name cannot be empty');
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

  logger.logRequest('POST', '/auth/register', {
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
    const validation = validateRegistrationData(body);
    if (!validation.isValid) {
      return createErrorResponse(
        `Validation failed: ${validation.errors.join(', ')}`,
        400,
        requestId
      );
    }

    const { email, password, name }: RegisterRequest = body;

    // Get Prisma client
    const prisma = await getPrismaClient();

    logger.info('Registering new user', { email, name, requestId });

    // Check if user already exists in our database
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return createErrorResponse('User with this email already exists', 409, requestId);
    }

    // Register user with Cognito
    const { userSub } = await cognitoService.registerUser(email, password, name);

    // Create user in our database
    const user = await prisma.user.create({
      data: {
        cognitoId: userSub,
        email,
        name,
        preferences: {},
      },
    });

    logger.info('User registered successfully', {
      userId: user.id,
      email: user.email,
      cognitoId: userSub,
      requestId,
    });

    const response: RegisterResponse = {
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
          accessToken: '', // Will be provided after login
          expiresAt: new Date(),
        },
      },
      message: 'User registered successfully. Please log in to get access tokens.',
    };

    const duration = Date.now() - startTime;
    logger.logResponse(201, duration, { requestId, functionName: context.functionName });

    return createSuccessResponse(response.data, 201, response.message, requestId);
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    logger.error('Registration failed', error, {
      requestId,
      functionName: context.functionName,
    });

    // Handle specific Cognito errors
    if (error.message.includes('UsernameExistsException')) {
      logger.logResponse(409, duration, { requestId, functionName: context.functionName });
      return createErrorResponse('User with this email already exists', 409, requestId);
    } else if (error.message.includes('InvalidPasswordException')) {
      logger.logResponse(400, duration, { requestId, functionName: context.functionName });
      return createErrorResponse('Password does not meet requirements', 400, requestId);
    } else if (error.message.includes('InvalidParameterException')) {
      logger.logResponse(400, duration, { requestId, functionName: context.functionName });
      return createErrorResponse('Invalid email format', 400, requestId);
    }

    logger.logResponse(500, duration, { requestId, functionName: context.functionName });
    return createErrorResponse(`Registration failed: ${error.message}`, 500, requestId);
  }
};
