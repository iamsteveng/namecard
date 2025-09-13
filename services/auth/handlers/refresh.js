// Direct imports to avoid unnecessary dependencies
const { default: logger } = require('@shared/utils/lambdaLogger');
const { createSuccessResponse, createErrorResponse, parseRequestBody, getRequestId } = require('@shared/lambda');
const { default: cognitoService } = require('@shared/services/cognito.service');

const handler = async (event, context) => {
  const startTime = Date.now();
  const requestId = getRequestId ? getRequestId(event) : context.awsRequestId;

  console.log(`[${requestId}] Token refresh request received`);

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

    if (!body?.refreshToken) {
      console.warn(`[${requestId}] Refresh token is required`);
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
          message: 'Refresh token is required',
          requestId,
        }),
      };
    }

    const { refreshToken } = body;

    console.log(`[${requestId}] Refreshing access token`);

    // Refresh token with Cognito
    const authResult = await cognitoService.refreshToken(refreshToken);

    const response = {
      success: true,
      data: {
        accessToken: authResult.accessToken,
        expiresAt: new Date(Date.now() + authResult.expiresIn * 1000),
      },
      message: 'Token refreshed successfully',
    };

    const duration = Date.now() - startTime;
    console.log(`[${requestId}] Token refreshed successfully in ${duration}ms`);

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
    
    console.error(`[${requestId}] Token refresh failed after ${duration}ms:`, error);

    let statusCode = 500;
    let message = 'Token refresh failed';

    if (
      error.message && (
        error.message.includes('NotAuthorizedException') ||
        error.message.includes('TokenExpiredException')
      )
    ) {
      statusCode = 401;
      message = 'Refresh token is invalid or expired';
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