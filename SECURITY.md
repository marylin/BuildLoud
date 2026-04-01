# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in BuildLoud, please report it responsibly:

1. **Do NOT open a public issue**
2. Use [GitHub Security Advisories](https://github.com/marylin/buildloud/security/advisories/new) (preferred)
3. Or email: hello@whateverai.dev

## Scope

This policy covers the BuildLoud codebase:
- `lib/` modules (scoring, caching, markdown writer, error logging)
- `scripts/` (hook scripts for commit and PR capture)
- `.claude-plugin/skills/` (Claude Code skill definitions)

Out of scope (report to their respective maintainers):
- Claude Code itself
- Your operating system's filesystem

## Response

As a solo-maintained project, I'll do my best to:
- Acknowledge reports within 48 hours
- Provide a fix or mitigation within 7 days for critical issues
- Credit reporters in the changelog (unless they prefer anonymity)
