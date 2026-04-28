# DevOps Agent Skills

## Overview

The DevOps Agent is responsible for implementing CI/CD, deployment, and infrastructure automation for the llm-cache project. This includes GitHub Actions workflows, Docker configurations, Kubernetes deployments, and infrastructure as code.

## Capabilities

### 1. CI/CD Pipeline

- Implement GitHub Actions workflows
- Create automated testing pipelines
- Build and publish Docker images
- Implement deployment automation

### 2. Container Orchestration

- Create Docker configurations
- Build Kubernetes manifests
- Implement Helm charts
- Configure auto-scaling

### 3. Infrastructure as Code

- Write Terraform configurations
- Create AWS infrastructure
- Configure networking and security
- Implement infrastructure monitoring

### 4. Monitoring & Operations

- Set up monitoring dashboards
- Configure alerting rules
- Implement log aggregation
- Create operational runbooks

## Input/Output Specifications

### Input

- Deployment requirements
- Infrastructure specifications
- Monitoring requirements
- Security requirements

### Output

- CI/CD pipeline configurations
- Docker and Kubernetes files
- Infrastructure as code
- Monitoring configurations

## Usage Examples

### Distribution Model Note

The Docker, Kubernetes, and Helm configurations described here apply to the **`@llm-cache/server` service wrapper**. The server is **optional for end users** (who can use `@llm-cache/core` directly) but is **required to develop and maintain** as a first-class workspace package. It must be built, tested, and released in lockstep with core releases.

### Example 1: GitHub Actions CI/CD Pipeline

**Request:**

```
Create a GitHub Actions workflow for:
- Running tests on PR
- Building and publishing Docker images
- Deploying to staging on merge to main
- Deploying to production on release
```

**Response:**

```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]
  release:
    types: [published]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  test:
    name: Test
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run linter
        run: pnpm lint

      - name: Run type checker
        run: pnpm typecheck

      - name: Run tests
        run: pnpm test:coverage

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          token: ${{ secrets.CODECOV_TOKEN }}

  build:
    name: Build and Push Docker Image
    needs: test
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=ref,event=branch
            type=sha,prefix={{branch}}-
            type=semver,pattern={{version}}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy-staging:
    name: Deploy to Staging
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: staging

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup kubectl
        uses: azure/setup-kubectl@v3
        with:
          version: 'v1.29.0'

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Update kubeconfig
        run: aws eks update-kubeconfig --name llm-cache-staging --region us-east-1

      - name: Deploy to staging
        run: |
          kubectl apply -f k8s/staging/
          kubectl rollout restart deployment/llm-cache

      - name: Verify deployment
        run: |
          kubectl rollout status deployment/llm-cache --timeout=300s
          kubectl get pods -l app=llm-cache

  deploy-production:
    name: Deploy to Production
    needs: build
    if: github.event_name == 'release'
    runs-on: ubuntu-latest
    environment: production

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Helm
        uses: azure/setup-helm@v3
        with:
          version: 'v3.14.0'

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Update kubeconfig
        run: aws eks update-kubeconfig --name llm-cache-production --region us-east-1

      - name: Deploy to production
        run: |
          helm upgrade --install llm-cache ./helm/llm-cache \
            --namespace production \
            --set image.tag=${{ github.event.release.tag_name }} \
            --set replicaCount=3 \
            --wait --timeout=10m

      - name: Run smoke tests
        run: |
          kubectl run smoke-test --image=curlimages/curl --rm -it --restart=Never \
            -- curl -f http://llm-cache.production.svc.cluster.local/health
```

### Example 2: Docker Configuration

**Request:**

```
Create a Dockerfile for the llm-cache application with:
- Multi-stage build for small image size
- Non-root user for security
- Health check
- Production optimizations
```

**Response:**

```dockerfile
# Dockerfile
FROM node:20-alpine AS base

# Install dependencies for node-gyp
RUN apk add --no-cache python3 make g++

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/core/package.json ./packages/core/
COPY packages/adapters/redis/package.json ./packages/adapters/redis/
COPY packages/adapters/dynamodb/package.json ./packages/adapters/dynamodb/
COPY packages/cost-tracker/package.json ./packages/cost-tracker/
COPY packages/observability/package.json ./packages/observability/

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

# Install dependencies
FROM base AS dependencies
RUN pnpm install --frozen-lockfile --filter=@llm-cache/core...

# Build application
FROM dependencies AS build
COPY packages/core ./packages/core
COPY packages/adapters ./packages/adapters
COPY packages/cost-tracker ./packages/cost-tracker
COPY packages/observability ./packages/observability
COPY tsconfig.json .

RUN pnpm build --filter=@llm-cache/core

# Production image
FROM node:20-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy built application
COPY --from=build --chown=nodejs:nodejs /app/packages/core/dist ./dist
COPY --from=dependencies --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=dependencies --chown=nodejs:nodejs /app/packages/core/node_modules ./node_modules

# Copy package.json for runtime
COPY packages/core/package.json ./

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start application
ENTRYPOINT ["dumb-init", "node", "dist/index.js"]
```

### Example 3: Kubernetes Deployment

**Request:**

```
Create Kubernetes deployment manifests for:
- Deployment with auto-scaling
- Service and Ingress
- ConfigMap and Secrets
- Resource limits
```

**Response:**

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: llm-cache
  labels:
    app: llm-cache
spec:
  replicas: 3
  selector:
    matchLabels:
      app: llm-cache
  template:
    metadata:
      labels:
        app: llm-cache
      annotations:
        prometheus.io/scrape: 'true'
        prometheus.io/port: '3000'
        prometheus.io/path: '/metrics'
    spec:
      containers:
        - name: llm-cache
          image: ghcr.io/reaatech/llm-cache:latest
          ports:
            - containerPort: 3000
              name: http
          env:
            - name: NODE_ENV
              value: 'production'
            - name: STORAGE_ADAPTER
              value: 'redis'
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: llm-cache-secrets
                  key: redis-url
            - name: OPENAI_API_KEY
              valueFrom:
                secretKeyRef:
                  name: llm-cache-secrets
                  key: openai-api-key
          envFrom:
            - configMapRef:
                name: llm-cache-config
          resources:
            requests:
              cpu: 250m
              memory: 512Mi
            limits:
              cpu: 1000m
              memory: 1Gi
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5

---
# k8s/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: llm-cache-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: llm-cache
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
    - type: Pods
      pods:
        metric:
          name: http_requests_per_second
        target:
          type: AverageValue
          averageValue: 100

---
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: llm-cache
  labels:
    app: llm-cache
spec:
  type: ClusterIP
  ports:
    - port: 80
      targetPort: 3000
      protocol: TCP
      name: http
  selector:
    app: llm-cache

---
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: llm-cache-config
data:
  LLM_CACHE_SIMILARITY_THRESHOLD: '0.8'
  LLM_CACHE_TTL_DEFAULT: '3600'
  LLM_CACHE_TTL_FACTUAL: '1800'
  LLM_CACHE_TTL_CREATIVE: '7200'
  LLM_CACHE_COST_ENABLED: 'true'
  LLM_CACHE_COST_CURRENCY: 'USD'
  LLM_CACHE_OBSERVABILITY_METRICS_ENABLED: 'true'
  LLM_CACHE_OBSERVABILITY_TRACING_ENABLED: 'true'
  LLM_CACHE_OBSERVABILITY_LOGGING_LEVEL: 'info'
```

## Best Practices

### 1. CI/CD

- Use matrix builds for testing
- Cache dependencies between runs
- Use ephemeral environments for PRs
- Implement canary deployments

### 2. Security

- Use non-root users in containers
- Scan images for vulnerabilities
- Use secrets management
- Implement network policies

### 3. Reliability

- Implement health checks
- Use readiness and liveness probes
- Configure proper resource limits
- Implement circuit breakers

### 4. Monitoring

- Export Prometheus metrics
- Configure structured logging
- Implement distributed tracing
- Set up alerting rules

## Constraints

### Technical Constraints

- Must support Node.js 18+
- Must use pnpm for package management
- Must support Kubernetes deployments (for `@llm-cache/server` service wrapper)
- Must integrate with AWS services
- Docker and k8s configurations are for the `@llm-cache/server` service wrapper (required to develop, optional for users)

### Performance Constraints

- Container startup: < 30 seconds
- Deployment rollout: < 5 minutes
- Auto-scaling response: < 2 minutes
- Zero-downtime deployments

## Integration Points

### With Architect Agent

- Follow infrastructure architecture
- Implement deployment patterns
- Provide infrastructure feedback

### With Core Agent

- Configure application deployment
- Set up environment variables
- Configure resource limits

### With Observability Agent

- Deploy monitoring infrastructure
- Configure log aggregation
- Set up alerting

### With Testing Agent

- Integrate tests into CI/CD
- Set up test environments
- Configure test reporting

## Quality Metrics

- **Deployment Frequency**: Multiple times per day
- **Lead Time**: < 1 hour from commit to production
- **Change Failure Rate**: < 5%
- **Mean Time to Recovery**: < 1 hour

## Tools and Resources

- **CI/CD**: GitHub Actions, ArgoCD
- **Containers**: Docker, Buildx
- **Orchestration**: Kubernetes, Helm
- **Infrastructure**: Terraform, AWS CDK
- **Monitoring**: Prometheus, Grafana, Jaeger

---

**Skill Version**: 1.0.0  
**Last Updated**: 2026-04-22  
**Maintained by**: reiatech
