import { getExecutionContext } from './context';
import { StructuredLogger } from './logger';

type MetricUnit =
  | 'Count'
  | 'Seconds'
  | 'Milliseconds';

interface MetricDatum {
  readonly name: string;
  readonly unit: MetricUnit;
  readonly value: number;
  readonly dimensions?: Record<string, string>;
}

export class MetricsEmitter {
  private readonly buffer: MetricDatum[] = [];

  constructor(
    private readonly namespace: string,
    private readonly serviceName: string,
    private readonly logger: StructuredLogger,
  ) {}

  public count(name: string, value = 1, dimensions?: Record<string, string>): void {
    this.push({ name, unit: 'Count', value, dimensions });
  }

  public duration(name: string, milliseconds: number, dimensions?: Record<string, string>): void {
    this.push({ name, unit: 'Milliseconds', value: milliseconds, dimensions });
  }

  public gauge(name: string, value: number, dimensions?: Record<string, string>): void {
    this.push({ name, unit: 'Count', value, dimensions });
  }

  public flush(): void {
    if (!this.buffer.length) {
      return;
    }

    const payload = {
      namespace: this.namespace,
      service: this.serviceName,
      metrics: this.buffer,
      timestamp: new Date().toISOString(),
    };

    this.logger.debug('metrics.flush', payload);
    this.buffer.length = 0;
  }

  private push(entry: MetricDatum): void {
    this.buffer.push(entry);
  }
}

const DEFAULT_NAMESPACE = process.env.POWERTOOLS_METRICS_NAMESPACE ?? 'NameCard';

export const createMetricsEmitter = (
  serviceName: string,
  logger: StructuredLogger,
  namespace: string = DEFAULT_NAMESPACE,
): MetricsEmitter => new MetricsEmitter(namespace, serviceName, logger);

export const getMetrics = (): MetricsEmitter => {
  const context = getExecutionContext();
  if (!context) {
    const logger = new StructuredLogger(process.env.SERVICE_NAME ?? 'unknown');
    return new MetricsEmitter(DEFAULT_NAMESPACE, process.env.SERVICE_NAME ?? 'unknown', logger);
  }

  return context.metrics;
};
