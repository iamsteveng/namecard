export const handler = async (event: any) => {
  const requestId = event?.requestContext?.requestId ?? 'unknown';

  return {
    statusCode: 501,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message: 'Service handler not implemented yet.',
      service: 'uploads',
      requestId,
    }),
  };
};
