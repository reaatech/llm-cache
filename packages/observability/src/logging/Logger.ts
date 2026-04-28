import { randomUUID } from 'node:crypto';

const SENSITIVE_FIELDS = [
  'password',
  'apiKey',
  'api_key',
  'secret',
  'token',
  'authorization',
  'prompt',
  'response',
  'credential',
  'private_key',
  'privateKey',
  'accessKeyId',
  'secretAccessKey',
];

const REDACTED_VALUE = '[REDACTED]';

export interface LoggerConfig {
  level?: 'error' | 'warn' | 'info' | 'debug';
  correlationId?: string;
  context?: Record<string, unknown>;
}

export class Logger {
  private _level: NonNullable<LoggerConfig['level']>;
  private correlationId: string;
  private context: Record<string, unknown>;

  private levels: Record<NonNullable<LoggerConfig['level']>, number> = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
  };

  constructor(config: LoggerConfig = {}) {
    this._level = config.level ?? 'info';
    this.correlationId = config.correlationId ?? this.generateId();
    this.context = this.redactObject(config.context ?? {});
  }

  child(context: Record<string, unknown>): Logger {
    return new Logger({
      level: this._level,
      correlationId:
        typeof context.correlationId === 'string' ? context.correlationId : this.correlationId,
      context: this.redactObject({ ...this.context, ...context }),
    });
  }

  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    if (this.levels[this._level] < this.levels.error) return;
    const sanitizedMeta = this.redactObject(meta ?? {});
    this.log('error', message, {
      ...sanitizedMeta,
      error: error?.message ?? undefined,
      stack: error?.stack ?? undefined,
    });
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    if (this.levels[this._level] < this.levels.warn) return;
    this.log('warn', message, this.redactObject(meta ?? {}));
  }

  info(message: string, meta?: Record<string, unknown>): void {
    if (this.levels[this._level] < this.levels.info) return;
    this.log('info', message, this.redactObject(meta ?? {}));
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (this.levels[this._level] < this.levels.debug) return;
    this.log('debug', message, this.redactObject(meta ?? {}));
  }

  performance(operation: string, durationMs: number, meta?: Record<string, unknown>): void {
    this.info(`Performance: ${operation} took ${durationMs}ms`, {
      type: 'performance',
      operation,
      duration_ms: durationMs,
      ...this.redactObject(meta ?? {}),
    });
  }

  cacheHit(type: 'exact' | 'semantic', latencyMs: number, confidence?: number): void {
    this.info(`Cache ${type} hit`, {
      type: 'cache_hit',
      hit_type: type,
      latency_ms: latencyMs,
      confidence,
    });
  }

  cacheMiss(latencyMs: number): void {
    this.info('Cache miss', {
      type: 'cache_miss',
      latency_ms: latencyMs,
    });
  }

  getCorrelationId(): string {
    return this.correlationId;
  }

  private log(_level: string, message: string, meta?: Record<string, unknown>): void {
    const entry = {
      level: _level,
      message,
      timestamp: new Date().toISOString(),
      correlationId: this.correlationId,
      ...this.context,
      ...meta,
    };
    const line = JSON.stringify(entry);
    if (_level === 'error' || _level === 'warn') {
      // eslint-disable-next-line no-console
      console.error(line);
    } else {
      // eslint-disable-next-line no-console
      console.log(line);
    }
  }

  private redactObject(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (this.isSensitiveField(key)) {
        result[key] = REDACTED_VALUE;
      } else if (value != null && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.redactObject(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  private isSensitiveField(key: string): boolean {
    return SENSITIVE_FIELDS.some((pattern) => key.toLowerCase() === pattern.toLowerCase());
  }

  private generateId(): string {
    return randomUUID();
  }
}
