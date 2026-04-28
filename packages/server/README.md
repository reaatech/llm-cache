# @llm-cache/server

HTTP service wrapper for llm-cache.

## Install

```bash
npm install -g @llm-cache/server
# or
npx @llm-cache/server
```

## Usage

### CLI

```bash
llm-cache-server
```

Environment variables:

- `PORT` — default `3000`
- `STORAGE_ADAPTER` — `memory`, `redis`, `dynamodb`
- `VECTOR_STORAGE_ADAPTER` — `memory`, `qdrant`
- `OPENAI_API_KEY` — required for embeddings
- `REDIS_URL`, `QDRANT_URL`, `DYNAMODB_REGION`, `DYNAMODB_TABLE`

### Docker

```bash
docker-compose up
```

### Endpoints

- `GET /health` — health check
- `GET /ready` — readiness probe
- `POST /cache/get` — lookup cache entry
- `POST /cache/set` — store cache entry
- `POST /cache/invalidate` — invalidate by criteria
- `GET /metrics` — metrics snapshot
- `GET /stats` — storage stats

## License

MIT
