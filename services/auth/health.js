exports.handler = async (event, context) => {
  console.log('Health check called');
  
  const healthData = {
    service: 'namecard-auth',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'staging',
    region: process.env.AWS_REGION,
    runtime: `nodejs${process.version}`,
    memoryLimitInMB: context.memoryLimitInMB,
    functionName: context.functionName,
    functionVersion: context.functionVersion,
    features: {
      registration: true,
      login: true,
      tokenRefresh: true,
      profile: true,
      logout: true,
    },
    dependencies: {
      database: 'not_configured',
      cognito: 'available',
      secrets: 'available',
    },
  };

  return {
    statusCode: 200,
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    },
    body: JSON.stringify({
      success: true,
      message: 'Auth service is healthy',
      data: healthData
    }),
  };
};