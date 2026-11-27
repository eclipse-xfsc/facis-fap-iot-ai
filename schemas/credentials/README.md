# Credential schemas

JSON Schemas for the three verifiable credentials of the FAP IoT & AI, with
examples, a validator and the OID4VCI issuer metadata generated from them.
Draft 0.2.

| File | What it is |
|---|---|
| `facis-common.schema.json` | Shared definitions: DID patterns, roles, purposes, status entry, VC envelope |
| `FacisParticipantCredential.schema.json` | Credential of a participant organisation (its connector). No personal data |
| `FapIotAiRoleCredential.schema.json` | Role credential of a person, held in their wallet |
| `FapServiceCredential.schema.json` | Credential of a machine client (connector, NiFi, Spark, AI processing) |
| `facis.context.jsonld` | JSON-LD context for the same terms |
| `examples/` | One valid and several invalid credentials per type |
| `generated/issuer-credential-configurations.json` | OID4VCI `credential_configurations_supported`, generated from the schemas: do not edit by hand |
| `tools/` | The validator and the generator |

The `$id` host `schemas.facis.example` is a placeholder until the schemas have
a published location.

## Checks

```bash
pip install -r schemas/credentials/tools/requirements.txt
python3 schemas/credentials/tools/validate-schemas.py           # valid examples pass, invalid ones fail
python3 schemas/credentials/tools/build-issuer-metadata.py --check  # generated metadata matches the schemas
```

After changing a schema, regenerate the metadata with
`python3 schemas/credentials/tools/build-issuer-metadata.py` and commit both.

## Claims

| Claim | Participant | Role | Service | Token claim | Used by |
|---|---|---|---|---|---|
| `credentialSubject.id` | organisation DID (did:web) | holder DID | service DID (did:web, below the organisation's) | `sub` | DSP `participantId`, login subject |
| `legalName` | required | | | | Catalogue display |
| `participantRoles` | `data_provider`, `data_consumer` | | | | Catalogue visibility, negotiation |
| `trustFramework` | `FACIS` | | | | Trusted participant check |
| `dspEndpoint` | optional | | | | Binding to the connector |
| `name`, `email` | | required | | `name`, `email` | Display only |
| `org_did` | (it is `id`) | required | required | `org_did` | Policy decisions per organisation |
| `roles` | | required | required | `roles` | Policy decisions, Keycloak realm roles |
| `purposes` | | optional | optional | `purpose` | Policy decisions (purpose), AI processing |
| `serviceType`, `serviceName` | | | required | `client_id` | Audit, policy decisions |

People and machine clients use the same roles, so policies don't need to know
whether the caller is a person or a service.

The role credential allows exactly name, email, organisation DID, roles and
purposes and rejects anything else (`additionalProperties: false`, see
`examples/role.invalid-extra-personal-data.json`). Purposes are not personal
data. Starter purpose list: `operations`, `analytics`, `research`,
`ai_insight`, `maintenance`. The schema only fixes the shape (a lowercase
code), so the list can change without a new schema version.

## Formats

| Format | State | Notes |
|---|---|---|
| JSON Schema | these files | Format-independent claim rules |
| `jwt_vc_json` | generated in the issuer metadata (`<id>_jwt`) | Claims under `credentialSubject`. The W-Stack's crypto provider doesn't verify this format in its current release |
| SD-JWT VC (`dc+sd-jwt`) | generated in the issuer metadata (`<id>_sd_jwt`) | The format the DSP connector and the guard verify. Claims at the top level, the subject DID in `sub`, the type in `vct` (`--vct-base`, a placeholder by default), the holder key in `cnf`. For the role credential, `name` and `email` are meant to be selectively disclosable; `org_did` and `roles` are always disclosed |
| JSON-LD (`ldp_vc`) | context provided, not generated | |

Adding a format means more configurations in the generator; the schemas stay
the same.

## Roles in Keycloak

The credential roles replace the current realm roles. Realm composite roles
keep the existing names working:

| Credential role | Includes the realm roles |
|---|---|
| `administrator` | `admin`, `operator`, `analyst`, `viewer` |
| `operator` | `operator`, `viewer` |
| `data_engineer` | `analyst`, `viewer` |
| `data_scientist` | `analyst`, `viewer`, `ai_insight_consumer` |
| `data_analyst` | `analyst`, `viewer`, `ai_insight_consumer` |
