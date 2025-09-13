import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import type { GetUserProfileResponse } from '@namecard/shared';

import {
  getPrismaClient,
  logger,
  createSuccessResponse,
  createErrorResponse,
  parseJsonBody,
  getRequestId,
} from '@shared/index';
import cognitoService from '@shared/services/cognito.service';

interface User {
  id: string;
  cognitoId: string;
  email: string;
}

interface UpdateProfileRequest {
  name?: string;
  avatarUrl?: string | null;
  preferences?: any;
}

// Simple JWT token verification for Lambda
async function verifyAuthToken(authHeader: string | undefined): Promise<User | null> {
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);
  
  try {
    // Verify token with Cognito and get user info
    const cognitoUser = await cognitoService.verifyToken(token);
    
    // Get user from our database
    const prisma = await getPrismaClient();
    const user = await prisma.user.findUnique({
      where: { cognitoId: cognitoUser.sub },
      select: { id: true, cognitoId: true, email: true },
    });

    return user;
  } catch (error) {
    return null;
  }
}

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  const startTime = Date.now();
  const requestId = getRequestId(event);
  const method = event.httpMethod;

  logger.logRequest(method, '/auth/profile', {
    requestId,
    functionName: context.functionName,
  });

  try {
    // Verify authentication
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    const user = await verifyAuthToken(authHeader);
    
    if (!user) {
      return createErrorResponse('User not authenticated', 401, requestId);
    }

    const prisma = await getPrismaClient();

    if (method === 'GET') {
      return await handleGetProfile(prisma, user, requestId, context, startTime);
    } else if (method === 'PUT') {
      return await handleUpdateProfile(event, prisma, user, requestId, context, startTime);
    } else {
      return createErrorResponse('Method not allowed', 405, requestId);
    }
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    logger.error('Profile operation failed', error, { requestId, method });
    logger.logResponse(500, duration, { requestId, functionName: context.functionName });
    
    return createErrorResponse('Profile operation failed', 500, requestId);
  }
};

async function handleGetProfile(
  prisma: any,
  user: User,
  requestId: string,
  context: Context,
  startTime: number
): Promise<APIGatewayProxyResult> {
  try {
    // Get full user data from database
    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        _count: {
          select: {
            cards: true,
          },
        },
      },
    });

    if (!fullUser) {
      return createErrorResponse('User not found', 404, requestId);
    }

    const response: GetUserProfileResponse = {
      success: true,
      data: {
        id: fullUser.id,
        email: fullUser.email,
        name: fullUser.name || undefined,
        avatarUrl: fullUser.avatarUrl || undefined,
        preferences: fullUser.preferences as any,
        cardCount: fullUser._count.cards,
        lastActivity: fullUser.updatedAt,
        createdAt: fullUser.createdAt,
        updatedAt: fullUser.updatedAt,
      },
    };

    const duration = Date.now() - startTime;
    logger.logResponse(200, duration, { requestId, functionName: context.functionName });

    return createSuccessResponse(response.data, 200, 'Profile retrieved successfully', requestId);
  } catch (error: any) {
    logger.error('Get profile failed', error, { userId: user.id, requestId });
    throw error;
  }
}

async function handleUpdateProfile(
  event: APIGatewayProxyEvent,
  prisma: any,
  user: User,
  requestId: string,
  context: Context,
  startTime: number
): Promise<APIGatewayProxyResult> {
  try {
    // Parse request body
    const body = parseJsonBody(event.body);
    if (!body) {
      return createErrorResponse('Invalid request body', 400, requestId);
    }

    const { name, avatarUrl, preferences }: UpdateProfileRequest = body;

    // Validate input
    if (name !== undefined && (typeof name !== 'string' || name.trim().length < 1)) {
      return createErrorResponse('Name must be a non-empty string', 400, requestId);
    }

    if (avatarUrl !== undefined && avatarUrl !== null && typeof avatarUrl !== 'string') {
      return createErrorResponse('Avatar URL must be a string', 400, requestId);
    }

    // Build update data
    const updateData: any = {};
    if (name !== undefined) {
      updateData.name = name.trim();
    }
    if (avatarUrl !== undefined) {
      updateData.avatarUrl = avatarUrl;
    }
    if (preferences !== undefined) {
      updateData.preferences = preferences;
    }

    // Update user in database
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
      include: {
        _count: {
          select: {
            cards: true,
          },
        },
      },
    });

    logger.info('Profile updated successfully', {
      userId: updatedUser.id,
      updatedFields: Object.keys(updateData),
      requestId,
    });

    const response = {
      success: true,
      data: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name || undefined,
        avatarUrl: updatedUser.avatarUrl || undefined,
        preferences: updatedUser.preferences as any,
        cardCount: updatedUser._count.cards,
        lastActivity: updatedUser.updatedAt,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
      },
      message: 'Profile updated successfully',
    };

    const duration = Date.now() - startTime;
    logger.logResponse(200, duration, { requestId, functionName: context.functionName });

    return createSuccessResponse(response.data, 200, response.message, requestId);
  } catch (error: any) {
    logger.error('Profile update failed', error, { userId: user.id, requestId });
    throw error;
  }
}