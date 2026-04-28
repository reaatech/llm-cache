# Architect Agent Skills

## Overview

The Architect Agent is responsible for system design, architecture decisions, and technical specifications for the llm-cache project. This agent provides high-level design guidance and ensures architectural consistency across all components.

## Capabilities

### 1. System Architecture Design

- Design modular, scalable system architectures
- Define component boundaries and interfaces
- Create architecture diagrams and documentation
- Evaluate architectural trade-offs

### 2. Technical Specification

- Write detailed technical specifications
- Define API contracts and data models
- Specify non-functional requirements
- Create architecture decision records (ADRs)

### 3. Design Pattern Selection

- Recommend appropriate design patterns
- Ensure pattern consistency across codebase
- Adapt patterns to project-specific needs
- Document pattern usage and rationale

### 4. Technology Evaluation

- Evaluate technology choices
- Assess third-party dependencies
- Recommend technology stacks
- Perform technology risk analysis

## Input/Output Specifications

### Input

- Project requirements and constraints
- Performance and scalability requirements
- Integration requirements
- Team capabilities and preferences

### Output

- Architecture diagrams
- Technical specifications
- Design documents
- ADRs (Architecture Decision Records) — **required** for:
  1. Qdrant vector database selection and integration strategy
  2. Library vs. service distribution model
  3. Encryption at rest and data privacy strategy
  4. Generation config fingerprinting approach
- Technology recommendations

## Usage Examples

### Example 1: Designing Cache Storage Architecture

**Request:**

```
Design the storage layer architecture for a semantic cache that needs to support:
- 1M+ cache entries
- Sub-50ms query latency
- Multi-region deployment
- Cost optimization
```

**Response:**

```markdown
# Storage Layer Architecture

## Recommended Design: Multi-Tier Storage

### Tier 1: In-Memory (Hot Cache)

- Technology: Redis Cluster
- Use case: Frequently accessed entries
- TTL: 1-24 hours
- Expected hit rate: 60%

### Tier 2: Persistent (Warm Cache)

- Technology: DynamoDB with DAX
- Use case: All cache entries
- TTL: 7-30 days
- Global tables for multi-region

## Data Model

- Partition key: `{useCase}#{modelVersion}#{promptHash}`
- Sort key: `timestamp`
- GSI1: `{useCase}` for use-case queries
- GSI2: `{modelVersion}` for model queries

## Performance Considerations

- Redis for <1ms exact match lookups
- DynamoDB for semantic search with embedding indices
- DAX for read-heavy workloads
```

### Example 2: Creating API Design

**Request:**

```
Design the public API for the CacheEngine class with support for:
- Multi-stage cache lookup
- Model versioning
- Cost tracking
- Observability
```

**Response:**

```typescript
// CacheEngine Public Interface
interface ICacheEngine {
  // Core Operations
  get(prompt: string, options?: CacheOptions): Promise<CacheResult>;
  set(prompt: string, response: string, metadata?: CacheMetadata): Promise<void>;
  delete(criteria: InvalidationCriteria): Promise<number>;

  // Batch Operations
  getBatch(prompts: string[], options?: CacheOptions): Promise<CacheResult[]>;
  setBatch(entries: CacheEntry[]): Promise<void>;
  warm(prompts: string[]): Promise<void>;

  // Management
  invalidate(criteria: InvalidationCriteria): Promise<number>;
  getStats(): Promise<CacheStats>;
  getConfig(): CacheConfig;
  setConfig(config: Partial<CacheConfig>): void;

  // Cost Tracking
  getCostSavings(period?: string): Promise<CostSavingsReport>;

  // Health & Monitoring
  healthCheck(): Promise<HealthStatus>;
  getMetrics(): Promise<Metrics>;
}
```

## Best Practices

### 1. Design Principles

- **Separation of Concerns**: Clear boundaries between components
- **Single Responsibility**: Each component has one well-defined purpose
- **Dependency Inversion**: Depend on abstractions, not concretions
- **Interface Segregation**: Small, focused interfaces

### 2. Documentation Standards

- Use clear, concise language
- Include diagrams for complex systems
- Document all assumptions and constraints
- Provide examples and usage patterns

### 3. Review Process

- Review all architecture decisions
- Validate against requirements
- Consider future scalability
- Assess security implications
- Ensure all ADRs are documented before implementation begins

## Constraints

### Technical Constraints

- Must support TypeScript strict mode
- Must be compatible with Node.js 18+
- Must follow enterprise security standards
- Must support observability requirements

### Process Constraints

- All designs must be reviewed by senior architects
- ADRs required for significant decisions
- Documentation must be updated with changes
- Performance impact must be measured

## Integration Points

### With Core Agent

- Provide detailed component specifications
- Review implementation for architectural compliance
- Validate design pattern usage

### With Storage Agent

- Define storage interface contracts
- Specify performance requirements
- Review storage implementation

### With Testing Agent

- Define testability requirements
- Specify integration test scenarios
- Review test coverage adequacy

### With DevOps Agent

- Define deployment requirements
- Specify infrastructure needs
- Review operational considerations

## Quality Metrics

- **Design Quality**: Meets all functional and non-functional requirements
- **Documentation Quality**: Clear, complete, and maintainable
- **Review Coverage**: 100% of significant decisions documented
- **Compliance**: Adheres to all architectural principles

## Tools and Resources

- **Vector Database**: Qdrant (primary), with HNSW for approximate nearest neighbor search
- **Diagramming**: Mermaid, PlantUML
- **Documentation**: Markdown, ADR templates
- **Analysis**: Architecture evaluation frameworks
- **Validation**: Prototype and proof-of-concept development

---

**Skill Version**: 1.0.0  
**Last Updated**: 2026-04-22  
**Maintained by**: reiatech
