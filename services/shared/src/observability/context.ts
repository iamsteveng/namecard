import { AsyncLocalStorage } from 'node:async_hooks';

import type { StructuredLogger } from './logger';
import type { MetricsEmitter } from './metrics';
import type { TracingManager } from './tracing';

export interface ExecutionContext {
  readonly requestId: string;
  readonly invocationId: string;
  readonly correlationIds: Record<string, string>;
  readonly serviceName: string;
  readonly logger: StructuredLogger;
  readonly metrics: MetricsEmitter;
  readonly tracing: TracingManager;
  readonly coldStart: boolean;
  readonly startedAt: number;
}

const storage = new AsyncLocalStorage<ExecutionContext>();

export const runWithExecutionContext = async <T>(
  context: ExecutionContext,
  callback: () => Promise<T> | T,
): Promise<T> => storage.run(context, callback);

export const getExecutionContext = (): ExecutionContext | undefined => storage.getStore();
