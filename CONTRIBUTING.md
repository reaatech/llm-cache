# Contributing to llm-cache

Thank you for your interest in contributing to llm-cache! This document provides guidelines and instructions for contributing to the project.

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 8.15+
- Git

### Setting Up Development Environment

```bash
# Fork the repository
gh repo fork reaatech/llm-cache

# Clone your fork
git clone https://github.com/YOUR_USERNAME/llm-cache.git
cd llm-cache

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Run linter
pnpm lint
```

## Development Workflow

### 1. Create a Branch

```bash
# Create a feature branch
git checkout -b feature/your-feature-name

# Or for bug fixes
git checkout -b fix/bug-description
```

### 2. Make Changes

- Follow the existing code style
- Write tests for new functionality
- Update documentation as needed
- Ensure all tests pass

### 3. Commit Changes

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```bash
# Feature
git commit -m "feat: add semantic caching support"

# Bug fix
git commit -m "fix: resolve memory leak in Redis adapter"

# Documentation
git commit -m "docs: update API documentation"

# Refactoring
git commit -m "refactor: improve cache lookup performance"
```

### 4. Push and Create Pull Request

```bash
# Push your branch
git push origin feature/your-feature-name

# Create a pull request
gh pr create --title "feat: add semantic caching support" --body "Description of changes"
```

## Pull Request Guidelines

### PR Title

- Use conventional commit format: `type: description`
- Keep it concise and descriptive

### PR Description

- Explain the motivation for the change
- Describe what was changed
- Link to related issues
- Include testing instructions

### Before Submitting

- [ ] All tests pass (`pnpm test`)
- [ ] Code is linted (`pnpm lint`)
- [ ] Type checking passes (`pnpm typecheck`)
- [ ] Test coverage meets requirements (90%+ for core, 85%+ for adapters)
- [ ] Documentation is updated
- [ ] Changes are rebased on latest main
- [ ] Security best practices followed (see SECURITY.md)

## Code Style

### TypeScript

- Use strict mode
- Explicit return types on functions
- No `any` types in public APIs
- Prefer interfaces over type aliases

### Formatting

- Prettier for formatting
- ESLint for code quality
- 100 character line length
- Single quotes for strings

### Testing

- Unit tests for all public functions
- Integration tests for adapters
- Test edge cases and error scenarios
- Maintain high test coverage

## Architecture Guidelines

### Follow Agent Skills

Refer to the skills defined in `skills/` directory for implementation patterns:

- **Architect Agent** - Design and architecture decisions
- **Core Agent** - Cache engine implementation
- **Storage Agent** - Storage adapter implementation
- **Embedding Agent** - Embedding and similarity matching
- **Cost Agent** - Cost tracking and pricing
- **Observability Agent** - Monitoring and logging
- **Testing Agent** - Test implementation
- **DevOps Agent** - CI/CD and deployment

### Package Structure

- Keep packages focused and modular
- Use clear naming conventions
- Document public APIs
- Maintain backward compatibility

## Testing

### Running Tests

```bash
# All tests
pnpm test

# Tests with coverage
pnpm test:coverage

# Specific package tests
pnpm test --filter=@reaatech/llm-cache

# Watch mode
pnpm test:watch
```

### Writing Tests

```typescript
import { describe, it, expect } from 'vitest';

describe('CacheEngine', () => {
  it('should return exact match when prompt hash exists', async () => {
    // Arrange
    const prompt = 'test prompt';
    const expectedEntry = createMockEntry(prompt);

    // Act
    const result = await cache.get(prompt);

    // Assert
    expect(result.hit).toBe(true);
    expect(result.type).toBe('exact');
  });
});
```

## Documentation

### Code Comments

- Document public APIs with JSDoc
- Explain complex logic
- Include usage examples

### README Updates

- Update README.md for user-facing changes
- Update package READMEs for package-specific changes
- Include migration guides for breaking changes

## Release Process

### Versioning

We follow [Semantic Versioning](https://semver.org/):

- MAJOR.MINOR.PATCH (e.g., 1.2.3)
- Breaking changes increment MAJOR
- New features increment MINOR
- Bug fixes increment PATCH

### Release Checklist

- [ ] Update version in package.json files
- [ ] Update CHANGELOG.md
- [ ] Create git tag
- [ ] Publish to npm
- [ ] Create GitHub release

## Getting Help

- **GitHub Issues** - Bug reports and feature requests
- **GitHub Discussions** - Questions and community support

## Code of Conduct

Please be respectful and constructive in your interactions. We are committed to providing a welcoming and inclusive experience for everyone.

## License

By contributing to llm-cache, you agree that your contributions will be licensed under the MIT License.

---

**Last Updated**: 2026-04-26
