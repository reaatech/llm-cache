# @llm-cache/adapters-dynamodb

DynamoDB storage adapter for llm-cache exact-match metadata storage.

## Install

```bash
npm install @llm-cache/adapters-dynamodb
```

## Usage

```typescript
import { DynamoDBAdapter } from '@llm-cache/adapters-dynamodb';

const adapter = new DynamoDBAdapter({
  region: 'us-east-1',
  tableName: 'llm-cache',
});

// Use adapter with CacheEngine
const cache = new CacheEngine({
  storage: adapter,
  vectorStorage: /* Qdrant or InMemoryAdapter */,
  embedder,
  config,
});
```

## Table Schema

Your DynamoDB table should have:

- **PK** (partition key) — exact-match key
- **GSI1** (`gsi1pk`, `gsi1sk`) — query by `useCase`
- **GSI2** (`gsi2pk`, `gsi2sk`) — query by `modelVersion`

## Notes

- Batch writes are chunked to DynamoDB's 25-item limit.
- Semantic search requires a separate vector database (e.g., Qdrant).

## License

MIT
