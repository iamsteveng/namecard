import { randomUUID } from 'node:crypto';

import { getExecutionContext } from './context';
import { StructuredLogger } from './logger';

interface SpanRecord {
  readonly id: string;
  readonly name: string;
  readonly startedAt: number;
  endedAt?: number;
  error?: string;
}

export class TracingManager {
  private readonly spans: SpanRecord[] = [];

  constructor(private readonly logger: StructuredLogger) {}

  public startSpan(name: string): { end: (error?: unknown) => void } {
    const span: SpanRecord = {
      id: randomUUID(),
      name,
      startedAt: Date.now(),
    };
    this.spans.push(span);
    this.logger.trace('trace.span.start', { spanId: span.id, name: span.name });

    return {
      end: (error?: unknown) => {
        span.endedAt = Date.now();
        if (error) {
          span.error = error instanceof Error ? error.message : String(error);
        }
        this.logger.trace('trace.span.end', {
          spanId: span.id,
          name: span.name,
          durationMs: span.endedAt - span.startedAt,
          error: span.error,
        });
      },
    };
  }

  public flush(): void {
    if (!this.spans.length) {
      return;
    }

    this.logger.debug('trace.flush', {
      spans: this.spans.map(span => ({
        id: span.id,
        name: span.name,
        durationMs: span.endedAt ? span.endedAt - span.startedAt : undefined,
        error: span.error,
      })),
    });
    this.spans.length = 0;
  }
}

export const createTracingManager = (logger: StructuredLogger): TracingManager => new TracingManager(logger);

export const getTracer = (): TracingManager => {
  const context = getExecutionContext();
  if (!context) {
    return new TracingManager(new StructuredLogger(process.env.SERVICE_NAME ?? 'unknown'));
  }

  return context.tracing;
};
