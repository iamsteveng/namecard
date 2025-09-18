exports.handler = async (event, context) => {
  console.log('Unified API health check called');
  
  const healthData = {
    service: 'namecard-unified-api',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'staging',
    region: process.env.AWS_REGION,
    runtime: `nodejs${process.version}`,
    memoryLimitInMB: context.memoryLimitInMB,
    functionName: context.functionName,
    functionVersion: context.functionVersion,
    services: {
      auth: {
        endpoint: 'https://rai2raecji.execute-api.ap-southeast-1.amazonaws.com/staging',
        status: 'available'
      },
      cards: {
        endpoint: 'https://v7h0gz3ozi.execute-api.ap-southeast-1.amazonaws.com/staging', 
        status: 'available'
      },
      upload: {
        endpoint: 'https://gk5ezv6x2j.execute-api.ap-southeast-1.amazonaws.com/staging',
        status: 'available'
      }
    },
    features: {
      proxy: true,
      routing: true,
      consolidation: true,
      cloudfrontReady: true,
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
      message: 'Unified API Gateway is healthy',
      data: healthData
    }),
  };
};