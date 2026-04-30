import { randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import {
  CacheEngine,
  type CacheOptions,
  type EmbeddingProvider,
  InMemoryAdapter,
  OpenAIEmbedder,
} from '@reaatech/llm-cache';
import { DynamoDBAdapter } from '@reaatech/llm-cache-adapters-dynamodb';
import { QdrantAdapter } from '@reaatech/llm-cache-adapters-qdrant';
import { RedisAdapter } from '@reaatech/llm-cache-adapters-redis';
import { Logger, MetricsCollector } from '@reaatech/llm-cache-observability';
import { loadConfig } from './config.js';

const config = loadConfig();
const logger = new Logger({ level: config.cacheConfig.observability.logging });
const metrics = new MetricsCollector({ enabled: config.cacheConfig.observability.metrics });

const MAX_BODY_BYTES = config.maxBodyBytes;

function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) {
      parsed.username = '';
      parsed.password = '';
    }
    return parsed.toString();
  } catch {
    return '<invalid-url>';
  }
}

async function createStorageAdapter() {
  switch (config.storageAdapter) {
    case 'redis': {
      if (!config.redisUrl) {
        throw new Error('REDIS_URL is required when STORAGE_ADAPTER=redis');
      }
      const adapter = new RedisAdapter({ url: config.redisUrl });
      await adapter.connect();
      logger.info('Connected to Redis', { url: redactUrl(config.redisUrl) });
      return adapter;
    }
    case 'dynamodb': {
      if (!config.dynamodbRegion || !config.dynamodbTable) {
        throw new Error(
          'DYNAMODB_REGION and DYNAMODB_TABLE are required when STORAGE_ADAPTER=dynamodb',
        );
      }
      return new DynamoDBAdapter({
        region: config.dynamodbRegion,
        tableName: config.dynamodbTable,
        endpoint: config.dynamodbEndpoint,
      });
    }
    default:
      logger.info('Using in-memory storage');
      return new InMemoryAdapter();
  }
}

async function createVectorStorageAdapter() {
  switch (config.vectorStorageAdapter) {
    case 'qdrant': {
      if (!config.qdrantUrl) {
        throw new Error('QDRANT_URL is required when VECTOR_STORAGE_ADAPTER=qdrant');
      }
      const adapter = new QdrantAdapter({
        url: config.qdrantUrl,
        apiKey: config.qdrantApiKey,
        collectionName: config.qdrantCollection ?? 'llm-cache',
        vectorSize: config.cacheConfig.embedding.dimensions,
      });
      await adapter.connect();
      logger.info('Connected to Qdrant', {
        url: redactUrl(config.qdrantUrl),
        collection: config.qdrantCollection,
      });
      return adapter;
    }
    default:
      logger.info('Using in-memory vector storage');
      return new InMemoryAdapter();
  }
}

function createEmbedder(): EmbeddingProvider {
  if (config.openaiApiKey) {
    return new OpenAIEmbedder({
      provider: 'openai',
      model: config.cacheConfig.embedding.model,
      dimensions: config.cacheConfig.embedding.dimensions,
      apiKey: config.openaiApiKey,
      organization: config.openaiOrganization,
      maxRetries: config.cacheConfig.embedding.maxRetries,
    });
  }

  logger.warn('OPENAI_API_KEY not set; embedder will throw on use');
  return {
    embed: () => {
      return Promise.reject(
        new Error('OpenAI API key not configured. Set OPENAI_API_KEY environment variable.'),
      );
    },
    embedBatch: () => {
      return Promise.reject(
        new Error('OpenAI API key not configured. Set OPENAI_API_KEY environment variable.'),
      );
    },
  };
}

export interface App {
  server: ReturnType<typeof createServer>;
  cache: CacheEngine;
  shutdown: () => Promise<void>;
}

export async function createApp(): Promise<App> {
  const [storage, vectorStorage, embedder] = await Promise.all([
    createStorageAdapter(),
    createVectorStorageAdapter(),
    createEmbedder(),
  ]);

  const cache = new CacheEngine({
    storage,
    vectorStorage,
    embedder,
    config: config.cacheConfig,
  });

  async function readBody(req: IncomingMessage): Promise<unknown> {
    const declared = Number(req.headers['content-length'] ?? 0);
    if (declared && declared > MAX_BODY_BYTES) {
      throw new HttpError(413, 'Request body too large');
    }

    return new Promise((resolve, reject) => {
      let received = 0;
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => {
        received += chunk.length;
        if (received > MAX_BODY_BYTES) {
          reject(new HttpError(413, 'Request body too large'));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString('utf8');
          resolve(body ? JSON.parse(body) : {});
        } catch {
          reject(new HttpError(400, 'Invalid JSON'));
        }
      });
      req.on('error', reject);
    });
  }

  function sendJson(res: ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  function sendPlainText(res: ServerResponse, status: number, body: string): void {
    res.writeHead(status, { 'Content-Type': 'text/plain; version=0.0.4' });
    res.end(body);
  }

  function isAuthorized(req: IncomingMessage): boolean {
    if (!config.apiKey) return true;
    const header = req.headers.authorization;
    if (!header || typeof header !== 'string') return false;
    const expected = `Bearer ${config.apiKey}`;
    const maxLen = Math.max(expected.length, header.length);
    const a = Buffer.alloc(maxLen, 0);
    const b = Buffer.alloc(maxLen, 0);
    a.write(expected);
    b.write(header);
    return timingSafeEqual(a, b);
  }

  const server = createServer((req, res) => {
    const rawCorrelationId = req.headers['x-correlation-id'];
    const correlationId =
      (Array.isArray(rawCorrelationId) ? rawCorrelationId[0] : rawCorrelationId) ?? randomUUID();
    res.setHeader('X-Correlation-Id', correlationId);
    const requestLogger = logger.child({ correlationId });
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

    void (async () => {
      try {
        // Public endpoints
        if (url.pathname === '/health' && req.method === 'GET') {
          sendJson(res, 200, { status: 'ok', timestamp: new Date().toISOString() });
          return;
        }

        if (url.pathname === '/ready' && req.method === 'GET') {
          const health = await cache.healthCheck();
          const healthy = health.storage && health.vectorStorage;
          sendJson(res, healthy ? 200 : 503, {
            status: healthy ? 'ready' : 'not ready',
            storage: health.storage,
            vectorStorage: health.vectorStorage,
          });
          return;
        }

        // Authenticated endpoints below
        if (!isAuthorized(req)) {
          sendJson(res, 401, { error: 'Unauthorized' });
          return;
        }

        if (url.pathname === '/cache/get' && req.method === 'POST') {
          const body = (await readBody(req)) as {
            prompt: string;
            options?: CacheOptions;
          };

          if (!body.prompt || typeof body.prompt !== 'string') {
            sendJson(res, 400, { error: 'Missing or invalid "prompt" field' });
            return;
          }
          if (body.options && typeof body.options !== 'object') {
            sendJson(res, 400, { error: '"options" must be an object' });
            return;
          }

          const start = Date.now();
          const result = await cache.get(body.prompt, body.options);
          const latency = Date.now() - start;

          if (result.hit) {
            metrics.recordHit(result.type);
            requestLogger.cacheHit(result.type, latency, result.confidence);
          } else {
            metrics.recordMiss();
            requestLogger.cacheMiss(latency);
          }
          metrics.recordLatency('get', latency);

          sendJson(res, 200, result);
          return;
        }

        if (url.pathname === '/cache/set' && req.method === 'POST') {
          const body = (await readBody(req)) as {
            prompt: string;
            response: unknown;
            options?: CacheOptions;
            metadata?: {
              queryType?: 'factual' | 'creative' | 'analytical';
              ttl?: number;
              sensitive?: boolean;
              tokens?: { prompt: number; completion: number };
            };
          };

          if (!body.prompt || typeof body.prompt !== 'string') {
            sendJson(res, 400, { error: 'Missing or invalid "prompt" field' });
            return;
          }
          if (body.response === undefined) {
            sendJson(res, 400, { error: 'Missing "response" field' });
            return;
          }
          if (body.options && typeof body.options !== 'object') {
            sendJson(res, 400, { error: '"options" must be an object' });
            return;
          }
          if (body.metadata && typeof body.metadata !== 'object') {
            sendJson(res, 400, { error: '"metadata" must be an object' });
            return;
          }

          const entry = await cache.set(body.prompt, body.response, body.options, body.metadata);
          sendJson(res, 200, { id: entry.id, cached: true });
          return;
        }

        if (url.pathname === '/cache/invalidate' && req.method === 'POST') {
          const body = (await readBody(req)) as {
            criteria?: {
              useCase?: string;
              modelVersion?: string;
              generationConfigHash?: string;
              embeddingModel?: string;
              olderThan?: string;
              promptHash?: string;
            };
          };

          const raw = body.criteria ?? {};
          const olderThanDate = raw.olderThan ? new Date(raw.olderThan) : undefined;
          if (raw.olderThan && Number.isNaN(olderThanDate?.getTime())) {
            sendJson(res, 400, { error: 'Invalid "olderThan" date' });
            return;
          }
          const criteria: Parameters<typeof cache.invalidate>[0] = {
            useCase: raw.useCase,
            modelVersion: raw.modelVersion,
            generationConfigHash: raw.generationConfigHash,
            embeddingModel: raw.embeddingModel,
            promptHash: raw.promptHash,
            olderThan: olderThanDate,
          };

          const result = await cache.invalidate(criteria);
          sendJson(res, 200, result);
          return;
        }

        if (url.pathname === '/metrics' && req.method === 'GET') {
          // Prometheus text exposition for scrapers; JSON via Accept: application/json
          if ((req.headers.accept ?? '').includes('application/json')) {
            sendJson(res, 200, {
              counters: metrics.getCounters(),
              histograms: metrics.getHistograms(),
            });
          } else {
            sendPlainText(res, 200, metrics.toPrometheus());
          }
          return;
        }

        if (url.pathname === '/stats' && req.method === 'GET') {
          const [storageStats, vectorStats] = await Promise.all([
            storage.getStats(),
            vectorStorage.getStats(),
          ]);
          sendJson(res, 200, { storage: storageStats, vectorStorage: vectorStats });
          return;
        }

        sendJson(res, 404, { error: 'Not found' });
      } catch (error) {
        if (error instanceof HttpError) {
          sendJson(res, error.status, { error: error.message });
          return;
        }
        // Log full detail server-side; only return a generic message to clients.
        const err = error instanceof Error ? error : new Error(String(error));
        requestLogger.error('Request failed', err, { path: url.pathname });
        metrics.recordError(url.pathname, err.name);
        sendJson(res, 500, { error: 'Internal server error', correlationId });
      }
    })();
  });

  async function shutdown(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    if ('disconnect' in storage && typeof storage.disconnect === 'function') {
      await storage.disconnect();
    }
    if ('disconnect' in vectorStorage && typeof vectorStorage.disconnect === 'function') {
      await vectorStorage.disconnect();
    }
  }

  return { server, cache, shutdown };
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export async function main(): Promise<void> {
  const app = await createApp();
  app.server.listen(config.port, () => {
    logger.info(`llm-cache server listening on port ${config.port}`, {
      storage: config.storageAdapter,
      vectorStorage: config.vectorStorageAdapter,
      authRequired: Boolean(config.apiKey),
    });
  });

  const onSignal = (signal: NodeJS.Signals): void => {
    logger.info(`Received ${signal}, shutting down gracefully`);
    app
      .shutdown()
      .then(() => process.exit(0))
      .catch((err) => {
        logger.error('Shutdown failed', err instanceof Error ? err : new Error(String(err)));
        process.exit(1);
      });
  };
  process.once('SIGTERM', onSignal);
  process.once('SIGINT', onSignal);
}
