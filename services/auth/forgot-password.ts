import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

import {
  getPrismaClient,
  logger,
  createSuccessResponse,
  createErrorResponse,
  parseJsonBody,
  getRequestId,
  cognitoService,
} from '@namecard/serverless-shared/auth-index';

interface ForgotPasswordRequest {
  email: string;
}

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  const startTime = Date.now();
  const requestId = getRequestId(event);

  logger.logRequest('POST', '/auth/forgot-password', {
    requestId,
    functionName: context.functionName,
  });

  try {
    // Parse request body
    const body = parseJsonBody(event.body);
    if (!body?.email) {
      return createErrorResponse('Email is required', 400, requestId);
    }

    const { email }: ForgotPasswordRequest = body;

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      // Return success for security (don't reveal if email is invalid)
      return createSuccessResponse(
        { message: 'If an account with this email exists, a password reset link has been sent.' },
        200,
        'Password reset initiated',
        requestId
      );
    }

    const prisma = await getPrismaClient();

    logger.info('Forgot password initiated', { email, requestId });

    // Check if user exists in our database
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Don't reveal if user exists or not for security
      const duration = Date.now() - startTime;
      logger.logResponse(200, duration, { requestId, functionName: context.functionName });
      
      return createSuccessResponse(
        { message: 'If an account with this email exists, a password reset link has been sent.' },
        200,
        'Password reset request processed',
        requestId
      );
    }

    try {
      // Initiate forgot password flow with Cognito
      await cognitoService.forgotPassword(email);
    } catch (cognitoError: any) {
      // Log the error but don't expose it to the user for security
      logger.error('Cognito forgot password failed', cognitoError, { email, requestId });
    }

    const duration = Date.now() - startTime;
    logger.logResponse(200, duration, { requestId, functionName: context.functionName });

    // Always return success for security
    return createSuccessResponse(
      { message: 'If an account with this email exists, a password reset link has been sent.' },
      200,
      'Password reset request processed',
      requestId
    );
  } catch (error: any) {
    const duration = Date.now() - startTime;
    const { email } = parseJsonBody(event.body) || {};
    
    logger.error('Forgot password failed', error, { email, requestId });
    logger.logResponse(200, duration, { requestId, functionName: context.functionName });

    // Always return success for security
    return createSuccessResponse(
      { message: 'If an account with this email exists, a password reset link has been sent.' },
      200,
      'Password reset request processed',
      requestId
    );
  }
};
