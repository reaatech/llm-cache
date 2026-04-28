# Observability Agent Skills

## Overview

The Observability Agent is responsible for implementing monitoring, logging, and tracing capabilities for the llm-cache project. This includes metrics collection, distributed tracing, structured logging, and health monitoring.

## Capabilities

### 1. Metrics Collection

- Implement OpenTelemetry metrics
- Create custom metrics for cache operations
- Build Prometheus exporters
- Implement metrics aggregation

### 2. Distributed Tracing

- Implement OpenTelemetry tracing
- Create trace propagation
- Build span processors
- Integrate with tracing backends

### 3. Structured Logging

- Implement structured logging with pino
- Add correlation ID tracking
- Create log aggregation
- Implement log filtering

### 4. Health Monitoring

- Implement health checks
- Create readiness probes
- Build performance monitoring
- Implement alerting

## Input/Output Specifications

### Input

- Observability requirements
- Metrics specifications
- Tracing configuration
- Logging requirements

### Output

- Observability service implementations
- Metrics collection code
- Tracing instrumentation
- Health check implementations

## Usage Examples

### Example 1: Implementing Metrics Collection

**Request:**

```
Implement the MetricsCollector with:
- Cache hit/miss metrics
- Latency histograms
- Cost savings metrics
- Prometheus exporter
```

**Response:**

```typescript
import * as opentelemetry from '@opentelemetry/api';
import { MeterProvider } from '@opentelemetry/sdk-metrics';

export class MetricsCollector {
  private meter: opentelemetry.Meter;
  private hitCounter: opentelemetry.Counter;
  private missCounter: opentelemetry.Counter;
  private latencyHistogram: opentelemetry.Histogram;
  private savingsCounter: opentelemetry.Counter;
  private activeConnections: opentelemetry.UpDownCounter;

  constructor(config: MetricsCollectorConfig) {
    const meterProvider = new MeterProvider();
    this.meter = meterProvider.getMeter('llm-cache');

    // Cache operation counters
    this.hitCounter = this.meter.createCounter('cache_hits_total', {
      description: 'Total number of cache hits',
    });

    this.missCounter = this.meter.createCounter('cache_misses_total', {
      description: 'Total number of cache misses',
    });

    // Latency histogram
    this.latencyHistogram = this.meter.createHistogram('cache_operation_duration_ms', {
      description: 'Duration of cache operations in milliseconds',
      unit: 'ms',
    });

    // Cost savings counter
    this.savingsCounter = this.meter.createCounter('cost_savings_total', {
      description: 'Total cost savings from caching',
      unit: 'USD',
    });

    // Active connections gauge
    this.activeConnections = this.meter.createUpDownCounter('active_connections', {
      description: 'Number of active storage connections',
    });

    // Add view for latency buckets
    meterProvider.addView(
      new View({
        instrumentName: 'cache_operation_duration_ms',
        aggregation: new ExplicitBucketHistogramAggregation([
          0.1, 0.5, 1, 5, 10, 25, 50, 100, 250, 500, 1000,
        ]),
      })
    );
  }

  recordHit(type: 'exact' | 'semantic', latencyMs: number): void {
    const attributes: opentelemetry.Attributes = {
      type,
    };

    this.hitCounter.add(1, attributes);
    this.latencyHistogram.record(latencyMs, {
      ...attributes,
      operation: 'get',
    });
  }

  recordMiss(latencyMs: number): void {
    this.missCounter.add(1);
    this.latencyHistogram.record(latencyMs, {
      operation: 'get',
    });
  }

  recordSavings(amount: number): void {
    this.savingsCounter.add(amount);
  }

  recordConnectionChange(delta: number): void {
    this.activeConnections.add(delta);
  }

  recordError(operation: string, error: Error): void {
    this.meter.createCounter('cache_errors_total').add(1, {
      operation,
      errorType: error.name,
    });
  }

  recordSemanticHitQuality(accepted: boolean, useCase: string): void {
    this.meter.createCounter('semantic_hit_quality_total').add(1, {
      quality: accepted ? 'accepted' : 'rejected',
      useCase,
    });
  }
}
```

### Example 2: Implementing Distributed Tracing

**Request:**

```
Implement distributed tracing with:
- Cache operation spans
- Trace propagation
- Correlation ID tracking
- Jaeger exporter
```

**Response:**

```typescript
import * as opentelemetry from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';

export class DistributedTracing {
  private tracer: opentelemetry.Tracer;
  private provider: NodeTracerProvider;

  constructor(config: TracingConfig) {
    this.provider = new NodeTracerProvider({
      sampler: new TraceIdRatioBasedSampler(config.sampleRate ?? 0.1),
    });

    // Add OTLP exporter (replaces deprecated Jaeger exporter)
    if (config.otlpEndpoint) {
      const exporter = new OTLPTraceExporter({
        url: config.otlpEndpoint,
      });

      this.provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
    }

    this.provider.register();
    this.tracer = opentelemetry.trace.getTracer('llm-cache');
  }

  startCacheOperationSpan(
    operation: 'get' | 'set' | 'delete',
    prompt?: string
  ): opentelemetry.Span {
    const span = this.tracer.startSpan(`cache.${operation}`);

    span.setAttribute('operation', operation);
    span.setAttribute('cache.system', 'llm-cache');

    if (prompt) {
      // Don't log full prompt for security/privacy
      span.setAttribute('prompt.length', prompt.length);
      span.setAttribute('prompt.hash', this.hashPrompt(prompt));
    }

    return span;
  }

  recordCacheHit(span: opentelemetry.Span, type: 'exact' | 'semantic', confidence?: number): void {
    span.setAttribute('cache.hit', true);
    span.setAttribute('cache.hit_type', type);

    if (confidence !== undefined) {
      span.setAttribute('cache.confidence', confidence);
    }
  }

  recordCacheMiss(span: opentelemetry.Span): void {
    span.setAttribute('cache.hit', false);
  }

  withSpan<T>(
    name: string,
    fn: (span: opentelemetry.Span) => Promise<T>,
    attributes?: opentelemetry.SpanAttributes
  ): Promise<T> {
    return this.tracer.startActiveSpan(name, async (span) => {
      try {
        if (attributes) {
          span.setAttributes(attributes);
        }

        const result = await fn(span);
        span.setStatus({ code: opentelemetry.SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: opentelemetry.SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
        span.recordException(error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  injectContext(headers: Record<string, string>): void {
    const span = opentelemetry.trace.getActiveSpan();
    if (!span) return;

    const context = span.spanContext();
    headers['traceparent'] = `00-${context.traceId}-${context.spanId}-01`;
  }

  extractContext(headers: Record<string, string>): opentelemetry.Context | null {
    const traceparent = headers['traceparent'];
    if (!traceparent) return null;

    const parts = traceparent.split('-');
    if (parts.length !== 4) return null;

    const [, traceId, spanId] = parts;

    const spanContext = {
      traceId,
      spanId,
      traceFlags: opentelemetry.TraceFlags.SAMPLED,
    };

    return opentelemetry.trace.setSpanContext(opentelemetry.context.active(), spanContext);
  }

  private hashPrompt(prompt: string): string {
    return crypto.createHash('sha256').update(prompt).digest('hex').substring(0, 16);
  }

  async shutdown(): Promise<void> {
    await this.provider.shutdown();
  }
}
```

### Example 3: Implementing Structured Logging

**Request:**

```
Implement structured logging with:
- Correlation ID tracking
- Log levels
- JSON formatting
- Performance logging
```

**Response:**

```typescript
import pino from 'pino';

export class Logger {
  private logger: pino.Logger;
  private correlationId: string;

  constructor(config: LoggerConfig) {
    this.logger = pino({
      level: config.level ?? 'info',
      formatters: {
        level: (label) => ({ level: label }),
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    });

    this.correlationId = config.correlationId ?? crypto.randomUUID();
  }

  child(context: Record<string, any>): Logger {
    const childLogger = this.logger.child({
      correlationId: this.correlationId,
      ...context,
    });

    const logger = new Logger({
      level: this.logger.level,
      correlationId: this.correlationId,
    });
    logger.logger = childLogger;

    return logger;
  }

  info(message: string, ...args: any[]): void {
    this.logger.info({ message }, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.logger.warn({ message }, ...args);
  }

  error(message: string, error?: Error, ...args: any[]): void {
    this.logger.error({ message, error, stack: error?.stack }, ...args);
  }

  debug(message: string, ...args: any[]): void {
    this.logger.debug({ message }, ...args);
  }

  performance(operation: string, durationMs: number, metadata?: Record<string, any>): void {
    this.logger.info(
      {
        type: 'performance',
        operation,
        duration_ms: durationMs,
        correlationId: this.correlationId,
        ...metadata,
      },
      `Performance: ${operation} took ${durationMs}ms`
    );
  }

  cacheHit(type: 'exact' | 'semantic', latencyMs: number, confidence?: number): void {
    this.logger.info(
      {
        type: 'cache_hit',
        hit_type: type,
        latency_ms: latencyMs,
        confidence,
        correlationId: this.correlationId,
      },
      `Cache ${type} hit in ${latencyMs}ms`
    );
  }

  cacheMiss(latencyMs: number): void {
    this.logger.info(
      {
        type: 'cache_miss',
        latency_ms: latencyMs,
        correlationId: this.correlationId,
      },
      `Cache miss in ${latencyMs}ms`
    );
  }

  getCorrelationId(): string {
    return this.correlationId;
  }
}
```

## Best Practices

### 1. Metrics Design

- Use standard metric names and units
- Include relevant labels/attributes
- Set appropriate aggregation temporality
- Define clear metric documentation

### 2. Tracing

- Follow OpenTelemetry standards
- Include relevant span attributes
- Propagate context across boundaries
- Sample appropriately for production

### 3. Logging

- Use structured logging format
- Include correlation IDs
- Set appropriate log levels
- Avoid logging sensitive data

### 4. Performance

- Minimize observability overhead
- Batch metrics when possible
- Use async logging
- Sample high-volume traces

## Constraints

### Technical Constraints

- Must support OpenTelemetry standards
- Must integrate with Prometheus
- Must support distributed tracing
- Must handle high-volume logging

### Performance Constraints

- Metrics overhead: < 1% of operation time
- Tracing overhead: < 5% of operation time
- Logging overhead: < 2% of operation time
- Must handle 10000+ operations/second

## Integration Points

### With Architect Agent

- Follow observability architecture
- Implement standard patterns
- Provide observability feedback

### With Core Agent

- Instrument cache operations
- Add performance logging
- Track cache metrics

### With Storage Agent

- Monitor storage operations
- Track connection metrics
- Add storage tracing

### With Testing Agent

- Validate observability output
- Test metrics accuracy
- Verify tracing propagation

## Quality Metrics

- **Coverage**: 100% of operations instrumented
- **Accuracy**: Metrics match actual performance
- **Overhead**: < 5% total performance impact
- **Reliability**: 99.9% observability availability

## Tools and Resources

- **OpenTelemetry**: @opentelemetry/\* packages
- **Metrics**: Prometheus, Grafana
- **Tracing**: Jaeger, Zipkin, DataDog
- **Logging**: pino, ELK stack, CloudWatch Logs

---

**Skill Version**: 1.0.0  
**Last Updated**: 2026-04-22  
**Maintained by**: reiatech
