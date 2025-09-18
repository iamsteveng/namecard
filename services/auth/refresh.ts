import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import type { RefreshTokenResponse } from '@namecard/shared';

import {
  logger,
  createSuccessResponse,
  createErrorResponse,
  parseJsonBody,
  getRequestId,
  cognitoService,
} from '@namecard/serverless-shared/auth-index';

interface RefreshTokenRequest {
  refreshToken: string;
}

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  const startTime = Date.now();
  const requestId = getRequestId(event);

  logger.logRequest('POST', '/auth/refresh', {
    requestId,
    functionName: context.functionName,
  });

  try {
    // Parse request body
    const body = parseJsonBody(event.body);
    if (!body?.refreshToken) {
      return createErrorResponse('Refresh token is required', 400, requestId);
    }

    const { refreshToken }: RefreshTokenRequest = body;

    logger.info('Refreshing access token', { requestId });

    // Refresh token with Cognito
    const authResult = await cognitoService.refreshToken(refreshToken);

    const response: RefreshTokenResponse = {
      success: true,
      data: {
        accessToken: authResult.accessToken,
        expiresAt: new Date(Date.now() + authResult.expiresIn * 1000),
      },
    };

    const duration = Date.now() - startTime;
    logger.logResponse(200, duration, { requestId, functionName: context.functionName });

    return createSuccessResponse(response.data, 200, 'Token refreshed successfully', requestId);
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    logger.error('Token refresh failed', error, { requestId });

    let statusCode = 500;
    let message = 'Token refresh failed';

    if (
      error.message.includes('NotAuthorizedException') ||
      error.message.includes('TokenExpiredException')
    ) {
      statusCode = 401;
      message = 'Refresh token is invalid or expired';
    }

    logger.logResponse(statusCode, duration, { requestId, functionName: context.functionName });
    return createErrorResponse(message, statusCode, requestId);
  }
};
