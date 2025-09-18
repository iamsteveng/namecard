module.exports.handler = async () => ({
  statusCode: 200,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ success: true, service: 'namecard-scan', status: 'healthy', timestamp: new Date().toISOString() }),
});

