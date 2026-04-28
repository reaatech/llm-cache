import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { createApp } from './app.js';

const originalFetch = globalThis.fetch;

describe('Server App', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let baseUrl: string;

  beforeAll(async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.includes('api.openai.com')) {
          return new Response(
            JSON.stringify({ data: [{ embedding: new Array(1536).fill(0.1) }] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(input, init);
      })
    );

    process.env.OPENAI_API_KEY = 'test-key';
    const { createApp: factory } = await import('./app.js');
    app = await factory();
    await new Promise<void>((resolve) => {
      app.server.listen(0, () => {
        const address = app.server.address();
        if (address && typeof address === 'object') {
          baseUrl = `http://localhost:${address.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => app.server.close(() => resolve()));
    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
  });

  async function fetchJson(path: string, opts?: RequestInit) {
    const res = await fetch(`${baseUrl}${path}`, opts);
    const data = await res.json();
    return { status: res.status, data };
  }

  it('should return health status', async () => {
    const { status, data } = await fetchJson('/health');
    expect(status).toBe(200);
    expect(data.status).toBe('ok');
  });

  it('should return ready status', async () => {
    const { status, data } = await fetchJson('/ready');
    expect(status).toBe(200);
    expect(data.status).toBe('ready');
  });

  it('should set and get cache entries', async () => {
    const setRes = await fetchJson('/cache/set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'What is TypeScript?',
        response: { answer: 'A typed superset of JavaScript' },
        options: { model: 'gpt-4', modelVersion: 'gpt-4-0613' },
      }),
    });
    expect(setRes.status).toBe(200);
    expect(setRes.data.cached).toBe(true);

    const getRes = await fetchJson('/cache/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'What is TypeScript?',
        options: { model: 'gpt-4', modelVersion: 'gpt-4-0613' },
      }),
    });
    expect(getRes.status).toBe(200);
    expect(getRes.data.hit).toBe(true);
    expect(getRes.data.type).toBe('exact');
  });

  it('should invalidate entries', async () => {
    await fetchJson('/cache/set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'invalidate me',
        response: 'ok',
        options: { model: 'gpt-4', modelVersion: 'gpt-4-0613' },
      }),
    });

    const invRes = await fetchJson('/cache/invalidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ criteria: { useCase: 'general' } }),
    });
    expect(invRes.status).toBe(200);
    expect(typeof invRes.data.total).toBe('number');
    expect(typeof invRes.data.storage).toBe('number');
    expect(typeof invRes.data.vectorStorage).toBe('number');
  });

  it('should return Prometheus metrics by default', async () => {
    const res = await fetch(`${baseUrl}/metrics`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    const body = await res.text();
    expect(body).toContain('cache_requests_total');
  });

  it('should return JSON metrics when Accept: application/json', async () => {
    const { status, data } = await fetchJson('/metrics', {
      headers: { Accept: 'application/json' },
    });
    expect(status).toBe(200);
    expect(typeof data.counters).toBe('object');
  });

  it('should return stats', async () => {
    const { status, data } = await fetchJson('/stats');
    expect(status).toBe(200);
    expect(typeof data.storage).toBe('object');
    expect(typeof data.vectorStorage).toBe('object');
  });

  it('should return 404 for unknown routes', async () => {
    const { status, data } = await fetchJson('/unknown');
    expect(status).toBe(404);
    expect(data.error).toBe('Not found');
  });

  it('should return 400 for invalid cache/set payload', async () => {
    const { status } = await fetchJson('/cache/set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'hello' }),
    });
    expect(status).toBe(400);
  });

  it('should return 400 for invalid cache/get payload', async () => {
    const { status } = await fetchJson('/cache/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(status).toBe(400);
  });
});
