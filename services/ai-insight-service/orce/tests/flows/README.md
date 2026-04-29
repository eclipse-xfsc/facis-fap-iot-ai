# AI Insight ORCE Flow Tests

Mirror-fast suite for the AI Insight ORCE flows. Tests do not start Node-RED runtime; they validate route contracts and mirror critical function-node logic with deterministic helpers.

## Suite structure

- `bootstrap.spec.js`: structural sanity checks for flow files and key nodes.
- `anomaly.spec.js`, `energy-summary.spec.js`, `city-status.spec.js`: endpoint-level validation and contract checks.
- `policy-rate-limit.spec.js`: governance header, policy denial, and rate-limit behavior (`Retry-After`).
- `latest.spec.js`, `outputs.spec.js`: latest/output-id mapping and response-shape behavior.
- `openapi.spec.js`: OpenAPI route + schema/doc coverage checks.
- `helpers/*.js`: mirror implementations used for behavioral tests and formal coverage.

## Run tests

From `services/ai-insight-service/orce`:

- Run full suite: `npm run test:flows`
- Run one file: `node --test tests/flows/energy-summary.spec.js`
- Run formal coverage with thresholds: `npm run test:flows:coverage`

## Coverage policy

- Tool: `c8`
- Minimum thresholds: 90% for lines, branches, functions, statements.
- Coverage scope focuses on `tests/flows/helpers/**/*.js` (mirror logic used by tests).

## Mirror maintenance

Whenever function-node logic changes in:

- `flows/ai-insight-anomaly.json`
- `flows/ai-insight-energy-summary.json`
- `flows/ai-insight-city-status.json`
- `flows/ai-insight-latest.json`
- `flows/ai-insight-outputs.json`
- `flows/ai-insight-openapi.json`

update the corresponding helper in `tests/flows/helpers/` and adjust behavioral tests. Mirrors are contract guards and must remain aligned with flow behavior.

## Troubleshooting

- If wildcard tests fail in your shell, run explicit file paths with `node --test`.
- If coverage fails, inspect untested branches in helper modules and add focused edge-case tests.
