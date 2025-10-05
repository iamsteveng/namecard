import {
  withHttpObservability,
  getLogger,
  getMetrics,
  withIdempotency,
  clearIdempotencyEntries,
} from '@namecard/shared';
import type { LambdaHttpEvent } from '@namecard/shared';

describe('observability helpers', () => {
  const originalLog = console.log;
  const originalError = console.error;
  let capturedLogs: string[];
  let capturedErrors: string[];

  beforeEach(() => {
    process.env.LOG_LEVEL = 'debug';
    capturedLogs = [];
    capturedErrors = [];
    console.log = jest.fn(input => {
      capturedLogs.push(String(input));
    });
    console.error = jest.fn(input => {
      capturedErrors.push(String(input));
    });
    clearIdempotencyEntries();
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
  });

  it('wraps a lambda handler with structured logging and metrics', async () => {
    const handler = withHttpObservability(
      async () => ({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ok: true }),
      }),
      {
        serviceName: 'test-service',
      }
    );

    const response = await handler(
      {
        httpMethod: 'GET',
        rawPath: '/v1/example',
        headers: { 'x-request-id': 'demo-request' },
        requestContext: { requestId: 'unit-test-request' },
      } satisfies LambdaHttpEvent,
      { awsRequestId: 'aws-request-123' }
    );

    expect(response.statusCode).toBe(200);

    const parseLogs = () =>
      capturedLogs
        .map(entry => {
          try {
            return JSON.parse(entry);
          } catch {
            return undefined;
          }
        })
        .filter(Boolean) as Array<Record<string, unknown>>;

    let logPayloads = parseLogs();

    expect(logPayloads.some(payload => payload.message === 'lambda.invocation.started')).toBe(true);
    expect(logPayloads.some(payload => payload.message === 'lambda.invocation.completed')).toBe(
      true
    );

    const contextLogger = getLogger();
    contextLogger.info('inside-context');

    logPayloads = parseLogs();
    expect(logPayloads.some(payload => payload.message === 'inside-context')).toBe(true);

    const metrics = getMetrics();
    metrics.count('customMetric');
    expect(
      (metrics as unknown as { buffer: Array<{ name: string }> }).buffer.some(
        item => item.name === 'customMetric'
      )
    ).toBe(true);
    metrics.flush();
  });

  it('replays cached responses when idempotency key is provided', async () => {
    const event: LambdaHttpEvent = {
      httpMethod: 'POST',
      rawPath: '/v1/cards',
      headers: { 'Idempotency-Key': 'abc-123' },
      requestContext: { requestId: 'idempotency-test' },
    };

    const handler = withHttpObservability(
      async (incoming: LambdaHttpEvent) => {
        return withIdempotency(incoming.headers?.['Idempotency-Key'], async () => ({
          statusCode: 201,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ created: true, token: Math.random() }),
        }));
      },
      { serviceName: 'cards' }
    );

    const first = await handler(event, {});
    const second = await handler(event, {});

    expect(first.body).toEqual(second.body);
    expect(
      capturedLogs.filter(entry => entry.includes('idempotency.replay')).length
    ).toBeGreaterThan(0);
  });

  it('records failures and surfaces structured error logs', async () => {
    const handler = withHttpObservability(
      async () => {
        throw new Error('unit-failure');
      },
      { serviceName: 'failing-service' }
    );

    await expect(handler({ httpMethod: 'GET', rawPath: '/' }, {})).rejects.toThrow('unit-failure');

    const errorPayloads = capturedErrors
      .map(entry => {
        try {
          return JSON.parse(entry);
        } catch {
          return undefined;
        }
      })
      .filter(Boolean) as Array<Record<string, unknown>>;

    expect(errorPayloads.some(payload => payload.message === 'lambda.invocation.failed')).toBe(
      true
    );
    expect(errorPayloads.some(payload => (payload.error as any)?.message === 'unit-failure')).toBe(
      true
    );
  });
});
