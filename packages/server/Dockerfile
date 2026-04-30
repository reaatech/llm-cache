FROM node:20-alpine AS base

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/core/package.json ./packages/core/
COPY packages/adapters/redis/package.json ./packages/adapters/redis/
COPY packages/adapters/dynamodb/package.json ./packages/adapters/dynamodb/
COPY packages/adapters/qdrant/package.json ./packages/adapters/qdrant/
COPY packages/cost-tracker/package.json ./packages/cost-tracker/
COPY packages/observability/package.json ./packages/observability/
COPY packages/server/package.json ./packages/server/

RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

FROM base AS dependencies
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY packages ./packages
COPY tsconfig.json .

RUN pnpm build --filter=@reaatech/llm-cache-server...

FROM node:20-alpine AS production
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

WORKDIR /app

COPY --from=build --chown=nodejs:nodejs /app/packages/server/dist ./dist
COPY --from=build --chown=nodejs:nodejs /app/node_modules/.pnpm ./node_modules/.pnpm
COPY --from=build --chown=nodejs:nodejs /app/packages/server/package.json ./

USER nodejs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

ENTRYPOINT ["node", "dist/index.js"]
