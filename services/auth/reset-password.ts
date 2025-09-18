import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

import {
  logger,
  createSuccessResponse,
  createErrorResponse,
  parseJsonBody,
  getRequestId,
  cognitoService,
} from '@namecard/serverless-shared';

interface ResetPasswordRequest {
  email: string;
  confirmationCode: string;
  newPassword: string;
}

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  const startTime = Date.now();
  const requestId = getRequestId(event);

  logger.logRequest('POST', '/auth/reset-password', {
    requestId,
    functionName: context.functionName,
  });

  try {
    // Parse request body
    const body = parseJsonBody(event.body);
    if (!body) {
      return createErrorResponse('Invalid request body', 400, requestId);
    }

    const { email, confirmationCode, newPassword }: ResetPasswordRequest = body;

    // Validate required fields
    if (!email || !confirmationCode || !newPassword) {
      return createErrorResponse('Email, confirmation code, and new password are required', 400, requestId);
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return createErrorResponse('Invalid email format', 400, requestId);
    }

    // Validate password strength
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return createErrorResponse('Password must be at least 8 characters long', 400, requestId);
    }

    logger.info('Password reset confirmation', { email, requestId });

    // Confirm forgot password with Cognito
    await cognitoService.confirmForgotPassword(email, confirmationCode, newPassword);

    logger.info('Password reset successful', { email, requestId });

    const duration = Date.now() - startTime;
    logger.logResponse(200, duration, { requestId, functionName: context.functionName });

    return createSuccessResponse(
      { message: 'Password reset successful. You can now log in with your new password.' },
      200,
      'Password reset successful',
      requestId
    );
  } catch (error: any) {
    const duration = Date.now() - startTime;
    const { email } = parseJsonBody(event.body) || {};
    
    logger.error('Password reset failed', error, { email, requestId });

    let statusCode = 400;
    let message = 'Password reset failed. Please try again.';

    if (error.message.includes('CodeMismatchException')) {
      message = 'Invalid confirmation code';
    } else if (error.message.includes('ExpiredCodeException')) {
      message = 'Confirmation code has expired';
    } else if (error.message.includes('InvalidPasswordException')) {
      message = 'Password does not meet requirements';
    }

    logger.logResponse(statusCode, duration, { requestId, functionName: context.functionName });
    return createErrorResponse(message, statusCode, requestId);
  }
};
