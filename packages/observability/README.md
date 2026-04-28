# @llm-cache/observability

Observability, metrics, logging, and tracing utilities for llm-cache.

## Install

```bash
npm install @llm-cache/observability
```

## Usage

```typescript
import { Logger, MetricsCollector } from '@llm-cache/observability';

const logger = new Logger({ level: 'info', correlationId: 'req-123' });
logger.info('Cache hit', { type: 'exact' });
logger.cacheHit('exact', 12, 0.95);

const metrics = new MetricsCollector({ enabled: true });
metrics.recordHit('exact');
metrics.recordMiss();
metrics.recordLatency('get', 42);
```

## License

MIT
