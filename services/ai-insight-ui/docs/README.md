# FACIS FAP IoT & AI - AI Insight UI Documentation

This directory contains the technical documentation for the AI Insight UI in the
FACIS Federation Architecture Pattern (FAP) IoT & AI demonstrator.

## Structure

```text
docs/
|- README.md                      (this file)
|- flow-architecture.md           Message flow and topic routing reference
|- guides/
|  |- index.md                    Developer guide entrypoint
|  |- setup.md                    Local and container setup
|  |- architecture.md             UI architecture and component overview
|  `- configuration.md            Configuration layers and environment variables
`- deployment/
   `- ops-runbook.md              Operations runbook for DevOps
```

## Conventions

- Timestamps use ISO 8601 format with UTC (`Z` suffix) unless stated otherwise.
- Configuration examples use placeholder values (`<value>`) for sensitive data.
- Paths are relative to the `ai-insight-ui/` root unless stated otherwise.
- Component examples reference the Vue 3 SPA structure under `ui/app/src/`.
- Node-RED flow references use tab numbers (0-4) as documented in the flow structure.

## Related Root Files

- [README.md](../README.md) - project entrypoint
- [NOTICE.md](../NOTICE.md) - notices and third-party attributions
- [SECURITY.md](../SECURITY.md) - vulnerability reporting and security policy
- [LICENSE](../LICENSE) - Apache License 2.0

## License

This documentation is provided under the Apache License 2.0.

Copyright (c) 2025-2026 ATLAS IoT Lab GmbH.
