# Decision fixtures

The executable specification of the policy bundle: at least one allow and one deny fixture per
package (participant, catalogue, negotiation, transfer, ai_insight, login, lakehouse), plus edge
cases such as `32-negotiation-unmet-constraint.json`.

Each fixture is a JSON object:

```json
{
  "name": "60-login-allow",
  "query": "facis/login/allow",
  "input": { "roles": ["data_analyst"], "org_did": "did:web:org-x.facis.cloud" },
  "expect": "allow"
}
```

`query` is the OPA data path, `expect` is `allow` or `deny`. The replay builds the bundle with the example deployment data of
`deployment-data/` (trusted issuers and applications for `facis.login`), as a deployment would. Replay them with
`infrastructure/opa/check-fixtures.sh`, locally or in CI, or against a running policy engine by
posting each `input` to `/v1/data/<query>`.

Extend them, never weaken them: every package keeps at least its allow and deny pair, and the deny
fixtures are the ones that matter.
