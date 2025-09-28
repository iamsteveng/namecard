import { getExecutionContext } from './context';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
};

interface LogEnvelope {
  readonly level: LogLevel;
  readonly message: string;
  readonly timestamp: string;
  readonly service: string;
  readonly requestId?: string;
  readonly invocationId?: string;
  readonly coldStart?: boolean;
  readonly correlationIds?: Record<string, string>;
  readonly data?: Record<string, unknown> | undefined;
  readonly error?: ReturnType<typeof serializeError>;
}

const parseLogLevel = (value: string | undefined): LogLevel => {
  if (!value) {
    return 'info';
  }

  const normalized = value.toLowerCase();
  if (normalized === 'trace' || normalized === 'debug' || normalized === 'info' || normalized === 'warn' || normalized === 'error') {
    return normalized;
  }
  return 'info';
};

const GLOBAL_LOG_LEVEL = parseLogLevel(process.env['LOG_LEVEL']);

const shouldLog = (level: LogLevel) => LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[GLOBAL_LOG_LEVEL];

const emit = (envelope: LogEnvelope) => {
  const payload = JSON.stringify(envelope);
  if (envelope.level === 'error' || envelope.level === 'warn') {
    console.error(payload);
  } else {
    console.log(payload);
  }
};

export class StructuredLogger {
  private readonly baseFields: {
    readonly service: string;
    readonly requestId?: string;
    readonly invocationId?: string;
    readonly coldStart?: boolean;
    readonly correlationIds?: Record<string, string>;
  };

  constructor(
    private readonly serviceName: string,
    private readonly defaultContext: {
      readonly requestId?: string;
      readonly invocationId?: string;
      readonly coldStart?: boolean;
      readonly correlationIds?: Record<string, string>;
    } = {},
  ) {
    this.baseFields = {
      service: this.serviceName,
      ...(this.defaultContext.requestId ? { requestId: this.defaultContext.requestId } : {}),
      ...(this.defaultContext.invocationId ? { invocationId: this.defaultContext.invocationId } : {}),
      ...(typeof this.defaultContext.coldStart === 'boolean'
        ? { coldStart: this.defaultContext.coldStart }
        : {}),
      ...(this.defaultContext.correlationIds
        ? { correlationIds: this.defaultContext.correlationIds }
        : {}),
    };
  }

  public child(overrides: Partial<StructuredLogger['defaultContext']>): StructuredLogger {
    return new StructuredLogger(this.serviceName, {
      ...this.defaultContext,
      ...overrides,
    });
  }

  public trace(message: string, data?: Record<string, unknown>): void {
    this.log('trace', message, data);
  }

  public debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  public info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  public warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  public error(message: string, error?: unknown, data?: Record<string, unknown>): void {
    if (!shouldLog('error')) {
      return;
    }

    emit({
      ...this.baseFields,
      level: 'error',
      message,
      timestamp: new Date().toISOString(),
      data,
      error: serializeError(error),
    });
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (!shouldLog(level)) {
      return;
    }

    emit({
      ...this.baseFields,
      level,
      message,
      timestamp: new Date().toISOString(),
      data,
    });
  }
}

export const serializeError = (input: unknown) => {
  if (!input) {
    return undefined;
  }

  if (input instanceof Error) {
    return {
      name: input.name,
      message: input.message,
      stack: input.stack,
    };
  }

  if (typeof input === 'object') {
    return {
      name: 'Error',
      message: 'Non-Error thrown',
      details: input,
    };
  }

  return {
    name: 'Error',
    message: String(input),
  };
};

export const createLogger = (
  serviceName: string,
  context?: {
    readonly requestId?: string;
    readonly invocationId?: string;
    readonly coldStart?: boolean;
    readonly correlationIds?: Record<string, string>;
  },
): StructuredLogger => new StructuredLogger(serviceName, context);

export const getLogger = (): StructuredLogger => {
  const context = getExecutionContext();
  if (!context) {
    return new StructuredLogger(process.env['SERVICE_NAME'] ?? 'unknown');
  }

  return context.logger;
};
