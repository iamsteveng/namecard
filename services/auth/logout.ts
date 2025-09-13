import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import type { LogoutResponse } from '@namecard/shared';

import {
  logger,
  createSuccessResponse,
  createErrorResponse,
  getRequestId,
} from '@shared/index';
import cognitoService from '@shared/services/cognito.service';

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  const startTime = Date.now();
  const requestId = getRequestId(event);

  logger.logRequest('POST', '/auth/logout', {
    requestId,
    functionName: context.functionName,
  });

  try {
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (token) {
      try {
        // Sign out user globally in Cognito (invalidates all tokens)
        await cognitoService.globalSignOut(token);
        logger.info('User logged out successfully', { requestId });
      } catch (cognitoError: any) {
        // Log the error but don't fail the logout request
        logger.warn('Cognito logout failed but continuing', { error: cognitoError.message, requestId });
      }
    }

    const response: LogoutResponse = {
      success: true,
      data: {
        message: 'Logged out successfully',
      },
    };

    const duration = Date.now() - startTime;
    logger.logResponse(200, duration, { requestId, functionName: context.functionName });

    return createSuccessResponse(response.data, 200, 'Logged out successfully', requestId);
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    logger.error('Logout failed', error, { requestId });

    // Even if logout fails, we should return success to the client
    // This ensures the client can clear local tokens
    logger.logResponse(200, duration, { requestId, functionName: context.functionName });
    
    return createSuccessResponse(
      { message: 'Logged out successfully' },
      200,
      'Logged out successfully',
      requestId
    );
  }
};