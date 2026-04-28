# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

The llm-cache project takes security seriously. If you discover a security vulnerability, please report it privately rather than opening a public issue.

**To report a vulnerability:**

1. Go to https://github.com/reaatech/llm-cache/security/advisories/new
2. Fill in the advisory form with a detailed description
3. Include steps to reproduce if possible

You can expect:
- Acknowledgment within 48 hours
- A resolution timeline within 5 business days
- Credit in the release notes (unless you request anonymity)

## Security Considerations for Users

### Encryption

When using the `EncryptionService`, always provide a unique **salt** via the `salt` option or persist the auto-generated salt from `encryption.salt`. Using the same passphrase without a unique salt across installations weakens key derivation. See `packages/core/src/utils/encryption.ts`.

### API Key Management

- Never commit `.env` files to version control
- Use short-lived API keys where possible
- Rotate `LLM_CACHE_API_KEY` regularly
- Store AWS credentials via IAM roles or environment variables, never in code

### Redis / Qdrant

- Always use authentication (passwords/API keys) in production
- Bind services to localhost when possible, or use a private network
- Enable TLS for connections over untrusted networks

### Prompt Privacy

The logger automatically redacts sensitive fields (passwords, API keys, tokens, prompts) from log output. If you extend the logging system, ensure you maintain this redaction for any fields that may contain PII or credentials.

## Dependencies

We run `pnpm audit` on every CI run. Dependabot is configured to open PRs for critical security updates. Please keep your dependencies up to date.

## Disclosure Timeline

We follow a 90-day coordinated disclosure policy. Critical fixes are released as patch versions as soon as they are available.
