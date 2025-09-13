const handler = async (event, context) => {
  const startTime = Date.now();
  const requestId = context.awsRequestId;

  console.log(`[${requestId}] Auth service health check requested`);

  try {
    const healthData = {
      service: 'namecard-auth',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: process.env.NODE_ENV || process.env.STAGE,
      region: process.env.AWS_REGION,
      runtime: `nodejs${process.version}`,
      memoryLimitInMB: context.memoryLimitInMB,
      functionName: context.functionName,
      functionVersion: context.functionVersion,
      cognitoUserPoolId: process.env.COGNITO_USER_POOL_ID,
      features: {
        registration: true,
        login: true,
        tokenRefresh: true,
        profile: true,
        logout: true,
      },
      dependencies: {
        cognito: 'available',
        secrets: 'available',
      },
    };

    const response = {
      success: true,
      data: healthData,
      message: 'Auth service is healthy',
      requestId,
    };

    const duration = Date.now() - startTime;
    console.log(`[${requestId}] Health check completed successfully in ${duration}ms`);

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
    
    console.error(`[${requestId}] Health check failed after ${duration}ms:`, error);

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
        message: 'Auth service health check failed',
        error: process.env.NODE_ENV === 'production' ? undefined : error.message,
        requestId,
      }),
    };
  }
};

module.exports = { handler };