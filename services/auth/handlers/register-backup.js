// Direct imports to avoid unnecessary dependencies (like Sharp for image processing)
const { default: getPrismaClient } = require('@shared/lib/lambdaPrisma');
const { default: secretsService } = require('@shared/services/secrets.service');
const { default: cognitoService } = require('@shared/services/cognito.service');

// Validation function for registration data
function validateRegistrationData(data) {
  const errors = [];

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
  } else if (data.name.trim().length === 0) {
    errors.push('Name cannot be empty');
  }

  return { isValid: errors.length === 0, errors };
}

// Main Lambda handler
const handler = async (event, context) => {
  const startTime = Date.now();
  const requestId = context.awsRequestId;
  
  console.log(`[${requestId}] User registration request received`);

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

    // Validate input data
    const validation = validateRegistrationData(body);
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
          message: 'Validation failed',
          errors: validation.errors,
          requestId,
        }),
      };
    }

    const { email, password, name } = body;

    // Get database connection
    const prisma = await getPrismaClient();

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      console.warn(`[${requestId}] Registration failed: User already exists for email ${email}`);
      return {
        statusCode: 409,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
        },
        body: JSON.stringify({
          success: false,
          message: 'User with this email already exists',
          requestId,
        }),
      };
    }

    // Register user with Cognito
    const cognitoResult = await cognitoService.registerUser(email, password, name);
    
    console.log(`[${requestId}] Cognito user created with ID: ${cognitoResult.userSub}`);

    // Create user in database
    const dbUser = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name: name.trim(),
        cognitoId: cognitoResult.userSub,
        isVerified: false, // Will be verified via Cognito confirmation
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        name: true,
        cognitoId: true,
        isVerified: true,
        createdAt: true,
      },
    });

    const duration = Date.now() - startTime;
    console.log(`[${requestId}] User registration completed successfully in ${duration}ms`);

    return {
      statusCode: 201,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
      },
      body: JSON.stringify({
        success: true,
        message: 'User registered successfully',
        data: {
          user: dbUser,
          cognitoUserSub: cognitoResult.userSub,
          confirmationRequired: true,
          nextStep: 'Please check your email to verify your account',
        },
        requestId,
      }),
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${requestId}] Registration failed after ${duration}ms:`, error);

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
        message: 'Internal server error during registration',
        error: process.env.NODE_ENV === 'production' ? undefined : error.message,
        requestId,
      }),
    };
  }
};

// Export the handler
module.exports = { handler };