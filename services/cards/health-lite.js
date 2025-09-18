module.exports.handler = async (event, context) => {
  const start = Date.now();
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      success: true,
      service: 'namecard-cards',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start,
    }),
  };
};

