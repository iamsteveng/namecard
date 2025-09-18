exports.handler = async (event, context) => {
  const healthData = {
    service: 'namecard-auth',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'staging',
    region: process.env.AWS_REGION,
    runtime: `nodejs${process.version}`,
    memoryLimitInMB: context.memoryLimitInMB,
    functionName: context.functionName,
    functionVersion: context.functionVersion,
  };

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    },
    body: JSON.stringify({ success: true, message: 'Auth service is healthy', data: healthData }),
  };
};

