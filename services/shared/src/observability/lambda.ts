import { randomUUID } from 'node:crypto';

import { getExecutionContext, runWithExecutionContext } from './context';
import { createLogger, StructuredLogger } from './logger';
import { createMetricsEmitter, MetricsEmitter } from './metrics';
import { createTracingManager } from './tracing';
import { getPath, getRequestId, type LambdaHttpEvent } from '../utils/lambda.utils';

interface LambdaContext {
  awsRequestId?: string;
  functionName?: string;
  invokedFunctionArn?: string;
}

type HttpHandler<TEvent extends LambdaHttpEvent = LambdaHttpEvent, TResult = unknown> = (
  event: TEvent,
  context: LambdaContext,
) => Promise<TResult> | TResult;

interface ObservabilityOptions {
  readonly serviceName?: string;
}

const DEFAULT_SERVICE_NAME =
  process.env['POWERTOOLS_SERVICE_NAME'] ?? process.env['SERVICE_NAME'] ?? 'namecard';

const collectCorrelationIds = (event: LambdaHttpEvent, context: LambdaContext): Record<string, string> => {
  const headers = event.headers ?? {};
  const output: Record<string, string> = {};

  const candidateKeys = [
    'x-correlation-id',
    'x-request-id',
    'x-amzn-trace-id',
    'x-forwarded-for',
    'traceparent',
  ];

  for (const [key, value] of Object.entries(headers)) {
    if (!value) {
      continue;
    }
    const normalized = key.toLowerCase();
    if (candidateKeys.includes(normalized)) {
      output[normalized] = value;
    }
  }

  if (context.awsRequestId) {
    output['aws-request-id'] = context.awsRequestId;
  }

  return output;
};

const finalize = (logger: StructuredLogger, metrics: MetricsEmitter) => {
  metrics.flush();
  logger.trace('lambda.observability.flushed');
};

export const withHttpObservability = <TEvent extends LambdaHttpEvent = LambdaHttpEvent, TResult = unknown>(
  handler: HttpHandler<TEvent, TResult>,
  options?: ObservabilityOptions,
): HttpHandler<TEvent, TResult> => {
  let coldStart = true;
  const serviceName = options?.serviceName ?? DEFAULT_SERVICE_NAME;

  return async (event: TEvent, context: LambdaContext = {}): Promise<TResult> => {
    const requestId = getRequestId(event);
    const invocationId = randomUUID();
    const correlationIds = collectCorrelationIds(event, context);

    const logger = createLogger(serviceName, {
      requestId,
      invocationId,
      coldStart,
      correlationIds,
    });
    const metrics = createMetricsEmitter(serviceName, logger);
    const tracing = createTracingManager(logger);
    const startedAt = Date.now();

    return runWithExecutionContext(
      {
        requestId,
        invocationId,
        correlationIds,
        serviceName,
        logger,
        metrics,
        tracing,
        coldStart,
        startedAt,
      },
      async () => {
        const path = getPath(event);
        logger.info('lambda.invocation.started', {
          requestId,
          path,
          method: event.httpMethod ?? 'GET',
        });

        const primarySpan = tracing.startSpan('handler');

        try {
          const result = await handler(event, context);
          const durationMs = Date.now() - startedAt;
          metrics.duration('handlerDurationMs', durationMs, { path });
          metrics.count('handlerSuccess', 1);
          logger.info('lambda.invocation.completed', {
            path,
            durationMs,
          });
          primarySpan.end();
          return result;
        } catch (error) {
          const durationMs = Date.now() - startedAt;
          metrics.count('handlerErrors', 1, {
            errorName: error instanceof Error ? error.name : 'UnknownError',
          });
          logger.error('lambda.invocation.failed', error, {
            path,
            durationMs,
          });
          primarySpan.end(error);
          throw error;
        } finally {
          tracing.flush();
          finalize(logger, metrics);
          coldStart = false;
        }
      },
    );
  };
};

export const getInvocationContext = () => getExecutionContext();
