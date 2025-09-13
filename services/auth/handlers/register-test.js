const handler = async (event, context) => {
  const startTime = Date.now();
  const requestId = context.awsRequestId;

  console.log(`[${requestId}] User registration request received`);

  try {
    // Simple test response without any complex imports
    const testResponse = {
      success: true,
      message: 'Registration handler is working',
      data: {
        requestId,
        timestamp: new Date().toISOString(),
        functionName: context.functionName,
        memoryLimit: context.memoryLimitInMB,
        environment: process.env.NODE_ENV || process.env.STAGE,
      }
    };

    console.log(`[${requestId}] Test registration response created successfully`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
      },
      body: JSON.stringify(testResponse),
    };

  } catch (error) {
    console.error(`[${requestId}] Registration test error:`, error);

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
        message: 'Internal server error during registration test',
        error: error.message,
        requestId,
      }),
    };
  }
};

module.exports = { handler };