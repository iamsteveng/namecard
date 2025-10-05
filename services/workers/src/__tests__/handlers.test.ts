import { handler } from '../handlers';

describe('Lambda Handlers', () => {
  describe('handler', () => {
    it('should return success response', async () => {
      const event = {
        httpMethod: 'GET',
        path: '/test',
        headers: {},
        queryStringParameters: null,
        body: null,
      };

      const context = {
        callbackWaitsForEmptyEventLoop: false,
        functionName: 'test',
        functionVersion: '1',
        invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test',
        memoryLimitInMB: '128',
        awsRequestId: 'test-request-id',
        logGroupName: '/aws/lambda/test',
        logStreamName: 'test-stream',
        getRemainingTimeInMillis: () => 30000,
        done: jest.fn(),
        fail: jest.fn(),
        succeed: jest.fn(),
      };

      const result = await handler(event, context);

      expect(result).toEqual({
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          message: 'Hello from Lambda!',
          event: event.path,
        }),
      });
    });

    it('should handle errors gracefully', async () => {
      const event = {
        httpMethod: 'POST',
        path: '/error',
        headers: {},
        queryStringParameters: null,
        body: JSON.stringify({ trigger: 'error' }),
      };

      const context = {
        callbackWaitsForEmptyEventLoop: false,
        functionName: 'test',
        functionVersion: '1',
        invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test',
        memoryLimitInMB: '128',
        awsRequestId: 'test-request-id',
        logGroupName: '/aws/lambda/test',
        logStreamName: 'test-stream',
        getRemainingTimeInMillis: () => 30000,
        done: jest.fn(),
        fail: jest.fn(),
        succeed: jest.fn(),
      };

      const result = await handler(event, context);

      expect(result.statusCode).toBeGreaterThanOrEqual(400);
      expect(result.headers).toHaveProperty('Content-Type', 'application/json');
    });
  });
});
