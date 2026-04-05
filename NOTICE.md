# Notices for Eclipse FACIS FAP IoT & AI Demonstrator

This content is produced and maintained by the ATLAS IoT Lab GmbH
in the context of the Eclipse FACIS project.

## Project Information

- **Project:** Eclipse FACIS — Federation Architecture Pattern: IoT & AI Demonstrator
- **Project Home:** https://projects.eclipse.org/projects/technology.facis
- **License:** Apache License 2.0

## Copyright

Copyright (c) 2025–2026 ATLAS IoT Lab GmbH.

## Service Notices

This monorepo contains multiple services, each with detailed third-party notices:

- [Simulation Service](services/simulation/NOTICE.md)
- [AI Insight Service](services/ai-insight-service/NOTICE.md)
- [AI Insight UI](services/ai-insight-ui/NOTICE.md)

## Shared Infrastructure Dependencies

The following infrastructure components are used across the platform:

| Component | License | Usage |
|---|---|---|
| Kubernetes | Apache-2.0 | Container orchestration |
| Helm | Apache-2.0 | Kubernetes package management |
| Docker | Apache-2.0 | Containerization |
| GitHub Actions | N/A (SaaS) | CI/CD automation |

## Cryptography

This project does not include cryptographic software directly. TLS/mTLS certificates
for Kafka, Trino, and inter-service communication are provisioned by the Stackable
and Kubernetes platform operators and are not bundled with this distribution.
