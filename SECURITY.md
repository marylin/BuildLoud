# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Journey Logger, please report it responsibly:

1. **Do NOT open a public issue**
2. Use [GitHub Security Advisories](https://github.com/marylin/journey-logger/security/advisories/new) (preferred)
3. Or email: marylin@whateverai.com

## Scope

This policy covers the Journey Logger codebase itself:
- `lib/` modules (scoring, caching, markdown writer, DB client, seo-feed)
- `scripts/` (hook scripts, digest generator)
- Database migrations

Out of scope (report to their respective maintainers):
- Neon PostgreSQL infrastructure
- Anthropic API
- n8n workflows running on your own infrastructure
- Resend email service

## Response

As a solo-maintained project, I'll do my best to:
- Acknowledge reports within 48 hours
- Provide a fix or mitigation within 7 days for critical issues
- Credit reporters in the changelog (unless they prefer anonymity)
