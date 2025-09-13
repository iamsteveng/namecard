// Direct imports to avoid unnecessary dependencies
const { default: getPrismaClient } = require('@shared/lib/lambdaPrisma');
const { default: logger } = require('@shared/utils/lambdaLogger');
const { createSuccessResponse, createErrorResponse, parseRequestBody, getRequestId } = require('@shared/lambda');
const { default: cognitoService } = require('@shared/services/cognito.service');

// Simple JWT token verification for Lambda
async function verifyAuthToken(authHeader) {
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

const handler = async (event, context) => {
  const startTime = Date.now();
  const requestId = getRequestId ? getRequestId(event) : context.awsRequestId;
  const method = event.httpMethod;

  console.log(`[${requestId}] Profile ${method} request received`);

  try {
    // Verify authentication
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    const user = await verifyAuthToken(authHeader);
    
    if (!user) {
      console.warn(`[${requestId}] User not authenticated`);
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
        },
        body: JSON.stringify({
          success: false,
          message: 'User not authenticated',
          requestId,
        }),
      };
    }

    const prisma = await getPrismaClient();

    if (method === 'GET') {
      return await handleGetProfile(prisma, user, requestId, context, startTime);
    } else if (method === 'PUT') {
      return await handleUpdateProfile(event, prisma, user, requestId, context, startTime);
    } else {
      console.warn(`[${requestId}] Method not allowed: ${method}`);
      return {
        statusCode: 405,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
        },
        body: JSON.stringify({
          success: false,
          message: 'Method not allowed',
          requestId,
        }),
      };
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    
    console.error(`[${requestId}] Profile operation failed after ${duration}ms:`, error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
      },
      body: JSON.stringify({
        success: false,
        message: 'Profile operation failed',
        error: process.env.NODE_ENV === 'production' ? undefined : error.message,
        requestId,
      }),
    };
  }
};

async function handleGetProfile(prisma, user, requestId, context, startTime) {
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
      console.warn(`[${requestId}] User not found: ${user.id}`);
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
        },
        body: JSON.stringify({
          success: false,
          message: 'User not found',
          requestId,
        }),
      };
    }

    const response = {
      success: true,
      data: {
        id: fullUser.id,
        email: fullUser.email,
        name: fullUser.name || undefined,
        avatarUrl: fullUser.avatarUrl || undefined,
        preferences: fullUser.preferences,
        cardCount: fullUser._count.cards,
        lastActivity: fullUser.updatedAt,
        createdAt: fullUser.createdAt,
        updatedAt: fullUser.updatedAt,
      },
      message: 'Profile retrieved successfully',
    };

    const duration = Date.now() - startTime;
    console.log(`[${requestId}] Profile retrieved successfully in ${duration}ms`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
      },
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error(`[${requestId}] Get profile failed for user ${user.id}:`, error);
    throw error;
  }
}

async function handleUpdateProfile(event, prisma, user, requestId, context, startTime) {
  try {
    // Parse request body
    let body;
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } catch (error) {
      console.error(`[${requestId}] Invalid JSON in request body:`, error);
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
        },
        body: JSON.stringify({
          success: false,
          message: 'Invalid request body',
          requestId,
        }),
      };
    }

    if (!body) {
      console.warn(`[${requestId}] Request body is required`);
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
        },
        body: JSON.stringify({
          success: false,
          message: 'Invalid request body',
          requestId,
        }),
      };
    }

    const { name, avatarUrl, preferences } = body;

    // Validate input
    if (name !== undefined && (typeof name !== 'string' || name.trim().length < 1)) {
      console.warn(`[${requestId}] Invalid name provided`);
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
        },
        body: JSON.stringify({
          success: false,
          message: 'Name must be a non-empty string',
          requestId,
        }),
      };
    }

    if (avatarUrl !== undefined && avatarUrl !== null && typeof avatarUrl !== 'string') {
      console.warn(`[${requestId}] Invalid avatar URL provided`);
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
        },
        body: JSON.stringify({
          success: false,
          message: 'Avatar URL must be a string',
          requestId,
        }),
      };
    }

    // Build update data
    const updateData = {};
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

    console.log(`[${requestId}] Profile updated successfully for user ${updatedUser.id}, fields: ${Object.keys(updateData).join(', ')}`);

    const response = {
      success: true,
      data: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name || undefined,
        avatarUrl: updatedUser.avatarUrl || undefined,
        preferences: updatedUser.preferences,
        cardCount: updatedUser._count.cards,
        lastActivity: updatedUser.updatedAt,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
      },
      message: 'Profile updated successfully',
    };

    const duration = Date.now() - startTime;
    console.log(`[${requestId}] Profile updated successfully in ${duration}ms`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
      },
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error(`[${requestId}] Profile update failed for user ${user.id}:`, error);
    throw error;
  }
}

module.exports = { handler };