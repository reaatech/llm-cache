# LLM Cache - AI Agent Development Guide

## Overview

This document defines the AI agent framework for developing the llm-cache project. It outlines specialized agent skills, development workflows, and best practices for AI-assisted development.

## Agent Framework

### Core Development Agents

The llm-cache project utilizes specialized AI agents, each with distinct skills and responsibilities:

1. **Architect Agent** - System design and architecture decisions
2. **Core Agent** - Core caching engine implementation
3. **Storage Agent** - Storage adapter implementations
4. **Embedding Agent** - Embedding and similarity matching
5. **Cost Agent** - Cost tracking and pricing calculations
6. **Observability Agent** - Monitoring, logging, and metrics
7. **Testing Agent** - Test suite development and quality assurance
8. **DevOps Agent** - CI/CD, deployment, and infrastructure

### Agent Skill Structure

Each agent skill is defined in `skills/<agent-skill>/skills.md` with:

- Skill description and capabilities
- Input/output specifications
- Usage examples
- Best practices and constraints
- Integration points with other agents

## Development Workflow

### 1. Planning Phase

```
Architect Agent → Creates technical specifications
                 ↓
         Review & Approval
                 ↓
Core/Storage/Embedding Agents → Implement components
                 ↓
         Testing Agent → Quality assurance
                 ↓
         DevOps Agent → Deployment
```

### 2. Implementation Phase

Each agent follows a structured approach:

1. **Understand Requirements** - Review specifications and constraints
2. **Design Solution** - Create implementation plan
3. **Implement** - Write code following project standards
4. **Test** - Ensure quality with comprehensive tests
5. **Document** - Update relevant documentation

### 3. Review Phase

- Code review by relevant agents
- Integration testing
- Performance validation
- Security review

## Agent Skills Directory

```
skills/
├── architect/
│   └── skills.md      # Architecture and design skills
├── core/
│   └── skills.md      # Core caching engine skills
├── storage/
│   └── skills.md      # Storage adapter skills
├── embedding/
│   └── skills.md      # Embedding and similarity skills
├── cost/
│   └── skills.md      # Cost tracking skills
├── observability/
│   └── skills.md      # Monitoring and logging skills
├── testing/
│   └── skills.md      # Testing and QA skills
└── devops/
    └── skills.md      # CI/CD and deployment skills
```

## Using Agent Skills

### Example: Implementing a New Storage Adapter

1. **Architect Agent** reviews requirements and creates design
2. **Storage Agent** implements the adapter using storage skills
3. **Testing Agent** creates comprehensive tests
4. **DevOps Agent** sets up deployment configuration

### Example: Adding Cost Tracking

1. **Cost Agent** designs pricing calculation logic
2. **Core Agent** integrates cost tracking into cache entries
3. **Observability Agent** adds cost metrics and reporting
4. **Testing Agent** validates cost calculations

## Best Practices

### For AI Agents

1. **Follow Project Standards** - Adhere to TypeScript strict mode, ESLint rules, and code style
2. **Write Tests First** - Ensure test coverage before implementation
3. **Document Thoroughly** - Update relevant documentation with changes
4. **Consider Performance** - Optimize for latency and resource usage
5. **Security First** - Validate inputs and handle sensitive data appropriately
6. **Privacy by Design** - Never log full prompts at `info` level or above; use hashes for identification. Consider PII implications when caching LLM prompts.
7. **No `any` in Public APIs** - All public interfaces must be fully typed; avoid `any` and implicit returns.
8. **Handle All Async Errors** - No floating promises; all async operations must have error handling.
9. **Respect Data Classification** - Implement `sensitive` flags and encryption considerations for storage adapters.

### For Human Developers

1. **Review Agent Output** - Always review and validate AI-generated code
2. **Provide Clear Context** - Give agents complete requirements and constraints
3. **Iterate Collaboratively** - Work with agents to refine implementations
4. **Maintain Quality** - Ensure all changes meet project standards

## Agent Communication

Agents communicate through:

- **Shared Documentation** - DEV_PLAN.md, ARCHITECTURE.md, API docs
- **Code Comments** - Inline documentation and type definitions
- **Issue Tracking** - GitHub issues for coordination
- **Pull Requests** - Code review and integration

## Skill Development

New agent skills can be added by:

1. Creating `skills/<agent-skill>/skills.md`
2. Defining capabilities and constraints
3. Providing usage examples
4. Integrating with existing skills

## GitHub Integration

- **Repository**: https://github.com/reaatech/llm-cache
- **User**: reiatech
- **Branch Strategy**: Feature branches with PR reviews
- **CI/CD**: Automated testing and deployment

## Version Control

- **Main Branch**: `main` - Production-ready code
- **Development Branch**: `develop` - Integration branch
- **Feature Branches**: `feature/<scope>/<description>` where scope is a package name (e.g., `feature/core/ttl-strategy`, `feature/adapters-redis/cluster-support`)
- **Release Tags**: `v<major>.<minor>.<patch>`

## Quality Metrics

- **Test Coverage**: 90%+ for core, 85%+ for adapters
- **Performance**: <50ms for semantic search (p99)
- **Security**: Zero critical vulnerabilities
- **Documentation**: 100% API documentation coverage

## Support and Maintenance

### Agent Issues

If an agent produces unexpected results:

1. Review the skill definition for clarity
2. Provide additional context or constraints
3. Break down complex tasks into smaller steps
4. Escalate to human review if needed

### Human Oversight

All agent-generated code requires:

- Human review before merging
- Integration testing
- Performance validation
- Security assessment

## Future Enhancements

### Planned Agent Skills

1. **Security Agent** - Automated security scanning and validation
2. **Performance Agent** - Performance optimization and profiling
3. **Documentation Agent** - Automated documentation generation
4. **Migration Agent** - Version migration and upgrade assistance

### Integration Improvements

1. **Enhanced Context** - Better project context for agents
2. **Real-time Collaboration** - Live agent coordination
3. **Automated Testing** - Continuous test generation
4. **Smart Refactoring** - AI-assisted code improvement

## Contributing

To contribute agent skills:

1. Create a feature branch
2. Add or update skill definitions
3. Provide examples and tests
4. Submit a pull request

## License

MIT License - see LICENSE file for details.

---

**Last Updated**: 2026-04-22  
**Version**: 1.0.0  
**GitHub**: reiatech/llm-cache
