// Direct imports to avoid unnecessary dependencies
const { default: logger } = require('@shared/utils/lambdaLogger');
const { createSuccessResponse, createErrorResponse, getRequestId } = require('@shared/lambda');
const { default: cognitoService } = require('@shared/services/cognito.service');

const handler = async (event, context) => {
  const startTime = Date.now();
  const requestId = getRequestId ? getRequestId(event) : context.awsRequestId;

  console.log(`[${requestId}] User logout request received`);

  try {
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (token) {
      try {
        // Sign out user globally in Cognito (invalidates all tokens)
        await cognitoService.globalSignOut(token);
        console.log(`[${requestId}] User logged out successfully`);
      } catch (cognitoError) {
        // Log the error but don't fail the logout request
        console.warn(`[${requestId}] Cognito logout failed but continuing:`, cognitoError.message);
      }
    }

    const response = {
      success: true,
      data: {
        message: 'Logged out successfully',
      },
      message: 'Logged out successfully',
    };

    const duration = Date.now() - startTime;
    console.log(`[${requestId}] Logout completed successfully in ${duration}ms`);

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
    
    console.error(`[${requestId}] Logout failed after ${duration}ms:`, error);

    // Even if logout fails, we should return success to the client
    // This ensures the client can clear local tokens
    console.log(`[${requestId}] Returning success despite logout error to ensure client cleanup`);
    
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
          message: 'Logged out successfully',
        },
        message: 'Logged out successfully',
        requestId,
      }),
    };
  }
};

module.exports = { handler };