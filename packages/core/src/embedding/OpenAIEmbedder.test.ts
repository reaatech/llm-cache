import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAIEmbedder } from './OpenAIEmbedder.js';

describe('OpenAIEmbedder', () => {
  let embedder: OpenAIEmbedder;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    embedder = new OpenAIEmbedder({
      provider: 'openai',
      model: 'text-embedding-3-small',
      dimensions: 3,
      apiKey: 'test-key',
      maxRetries: 2,
      timeoutMs: 5000,
    });
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(
      embedder as unknown as { sleep: (ms: number) => Promise<void> },
      'sleep'
    ).mockResolvedValue();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function mockResponse(embeddings: number[][], status = 200) {
    return {
      ok: status === 200,
      status,
      text: () => Promise.resolve('error body'),
      json: () =>
        Promise.resolve({
          data: embeddings.map((embedding, index) => ({ embedding, index })),
        }),
    };
  }

  it('should fetch embedding on first call', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse([[0.1, 0.2, 0.3]]));
    const result = await embedder.embed('hello');
    expect(result).toEqual([0.1, 0.2, 0.3]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should cache embeddings', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse([[0.1, 0.2, 0.3]]));
    await embedder.embed('hello');
    await embedder.embed('hello');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should return different embeddings for different texts', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse([[0.1, 0.2, 0.3]]))
      .mockResolvedValueOnce(mockResponse([[0.4, 0.5, 0.6]]));

    const result1 = await embedder.embed('hello');
    const result2 = await embedder.embed('world');
    expect(result1).toEqual([0.1, 0.2, 0.3]);
    expect(result2).toEqual([0.4, 0.5, 0.6]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('should throw on dimension mismatch from API', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse([[0.1, 0.2]]));
    await expect(embedder.embed('hello', 3)).rejects.toThrow('dimension mismatch');
  });

  it('should throw on dimension mismatch from cache', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse([[0.1, 0.2, 0.3]]));
    await embedder.embed('hello', 3);
    await expect(embedder.embed('hello', 5)).rejects.toThrow('dimension mismatch');
  });

  it('should retry on network failure and eventually throw', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'));

    await expect(embedder.embed('hello')).rejects.toThrow('Network error');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('should succeed after retry', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(mockResponse([[0.1, 0.2, 0.3]]));

    const result = await embedder.embed('hello');
    expect(result).toEqual([0.1, 0.2, 0.3]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('should retry on 429 rate limit', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse([], 429))
      .mockResolvedValueOnce(mockResponse([[0.1, 0.2, 0.3]]));

    const result = await embedder.embed('hello');
    expect(result).toEqual([0.1, 0.2, 0.3]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('should retry on 5xx server errors', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse([], 503))
      .mockResolvedValueOnce(mockResponse([[0.1, 0.2, 0.3]]));

    const result = await embedder.embed('hello');
    expect(result).toEqual([0.1, 0.2, 0.3]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('should not retry on 4xx client errors except 429', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse([], 400));
    await expect(embedder.embed('hello')).rejects.toThrow('OpenAI API error 400');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should send organization header when configured', async () => {
    const orgEmbedder = new OpenAIEmbedder({
      provider: 'openai',
      model: 'text-embedding-3-small',
      dimensions: 3,
      apiKey: 'test-key',
      organization: 'org-123',
    });
    fetchMock.mockResolvedValueOnce(mockResponse([[0.1, 0.2, 0.3]]));
    await orgEmbedder.embed('hello');

    const call = fetchMock.mock.calls[0];
    expect(call[1].headers['OpenAI-Organization']).toBe('org-123');
  });

  it('should batch embed in a single request', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse([
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ])
    );

    const results = await embedder.embedBatch(['hello', 'world']);
    expect(results).toEqual([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should evict oldest entry when cache is full', async () => {
    const small = new OpenAIEmbedder({
      provider: 'openai',
      model: 'text-embedding-3-small',
      dimensions: 3,
      apiKey: 'test-key',
      cacheSize: 2,
    });
    fetchMock
      .mockResolvedValueOnce(mockResponse([[0.1, 0.2, 0.3]]))
      .mockResolvedValueOnce(mockResponse([[0.4, 0.5, 0.6]]))
      .mockResolvedValueOnce(mockResponse([[0.7, 0.8, 0.9]]))
      .mockResolvedValueOnce(mockResponse([[0.1, 0.2, 0.3]]));

    await small.embed('a');
    await small.embed('b');
    await small.embed('c'); // evicts 'a'
    await small.embed('a'); // refetched
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
