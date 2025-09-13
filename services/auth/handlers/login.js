// Direct imports to avoid unnecessary dependencies (like Sharp for image processing)
const { default: getPrismaClient } = require('@shared/lib/lambdaPrisma');
const { default: logger } = require('@shared/utils/lambdaLogger');
const { createSuccessResponse, createErrorResponse, parseRequestBody, getRequestId } = require('@shared/lambda');
const { default: cognitoService } = require('@shared/services/cognito.service');

// Validation function for login data
function validateLoginData(data) {
  const errors = [];

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

const handler = async (event, context) => {
  const startTime = Date.now();
  const requestId = getRequestId ? getRequestId(event) : context.awsRequestId;

  console.log(`[${requestId}] User login request received`);

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
          message: 'Invalid JSON in request body',
          requestId,
        }),
      };
    }

    // Validate request data
    const validation = validateLoginData(body);
    if (!validation.isValid) {
      console.warn(`[${requestId}] Validation failed:`, validation.errors);
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
          message: `Validation failed: ${validation.errors.join(', ')}`,
          requestId,
        }),
      };
    }

    const { email, password } = body;

    // Get Prisma client
    const prisma = await getPrismaClient();

    console.log(`[${requestId}] User login attempt for email: ${email}`);

    // Authenticate with Cognito
    const authResult = await cognitoService.authenticateUser(email, password);

    if (authResult.challengeName) {
      // Handle auth challenges (e.g., force password change)
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
        },
        body: JSON.stringify({
          success: true,
          data: {
            requiresChallenge: true,
            challengeName: authResult.challengeName,
            session: authResult.session,
          },
          message: 'Authentication challenge required',
          requestId,
        }),
      };
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
      console.log(`[${requestId}] Created user during login: ${user.id}`);
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
        console.log(`[${requestId}] Updated user during login: ${user.id}`);
      }
    }

    console.log(`[${requestId}] User logged in successfully: ${user.id}`);

    const response = {
      success: true,
      data: {
        user: {
          id: user.id,
          cognitoId: user.cognitoId,
          email: user.email,
          name: user.name || undefined,
          avatarUrl: user.avatarUrl || undefined,
          preferences: user.preferences,
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
            preferences: user.preferences,
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
    console.log(`[${requestId}] Login completed successfully in ${duration}ms`);

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
    const duration = Date.now() - startTime;
    const { email } = body || {};
    
    console.error(`[${requestId}] Login failed after ${duration}ms:`, error);

    // Handle Cognito-specific errors
    let statusCode = 401;
    let message = 'Login failed. Please try again.';

    if (error.message && error.message.includes('NotAuthorizedException')) {
      message = 'Invalid email or password';
    } else if (error.message && error.message.includes('UserNotConfirmedException')) {
      message = 'Account not verified. Please check your email.';
    } else if (error.message && error.message.includes('UserNotFoundException')) {
      message = 'Invalid email or password';
    } else if (error.message && error.message.includes('TooManyRequestsException')) {
      statusCode = 429;
      message = 'Too many login attempts. Please try again later.';
    }

    return {
      statusCode: statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
      },
      body: JSON.stringify({
        success: false,
        message: message,
        error: process.env.NODE_ENV === 'production' ? undefined : error.message,
        requestId,
      }),
    };
  }
};

module.exports = { handler };