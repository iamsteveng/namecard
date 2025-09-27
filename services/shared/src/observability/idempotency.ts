import { getExecutionContext } from './context';
import { StructuredLogger } from './logger';

interface CacheEntry<T> {
  readonly payload: T;
  readonly recordedAt: number;
  readonly ttlMs: number;
}

const store = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTL_MS = 5 * 60 * 1000; // five minutes

const getLoggerInstance = (): StructuredLogger => {
  const context = getExecutionContext();
  if (!context) {
    return new StructuredLogger(process.env.SERVICE_NAME ?? 'unknown');
  }
  return context.logger;
};

export const extractIdempotencyKey = (
  headers?: Record<string, string | undefined> | null,
): string | undefined => {
  if (!headers) {
    return undefined;
  }

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'idempotency-key') {
      return value ?? undefined;
    }
  }
  return undefined;
};

export const withIdempotency = async <T>(
  key: string | undefined,
  callback: () => Promise<T>,
  options?: { ttlMs?: number },
): Promise<T> => {
  if (!key) {
    return callback();
  }

  const ttl = options?.ttlMs ?? DEFAULT_TTL_MS;
  const logger = getLoggerInstance();
  const now = Date.now();
  const existing = store.get(key);

  if (existing && now - existing.recordedAt < existing.ttlMs) {
    logger.info('idempotency.replay', { key });
    return existing.payload as T;
  }

  const payload = await callback();
  store.set(key, { payload, recordedAt: now, ttlMs: ttl });
  logger.debug('idempotency.recorded', { key, ttlMs: ttl });
  return payload;
};

export const clearIdempotencyEntries = (): void => {
  store.clear();
};
