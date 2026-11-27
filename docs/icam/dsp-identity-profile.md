# DSP identity profile

How DSP connectors prove who they are to each other, and what the IoT & AI DSP connector checks.
Companion to flows F1, F4 and F5 of [`../architecture/icam-flows.md`](../architecture/icam-flows.md).

## Roles

- **The federation** issues participant credentials and publishes their status lists. Its
  operators offer credentials; they never act inside a participant's systems.
- **Each participant** holds its credential in its own wallet: a tenant of an OCM W-Stack, with
  credential retrieval and storage and a crypto provider holding the participant's key. Its DSP
  connector accepts the credential, presents it, and verifies its counterparties'. The connector
  holds no private key.

Only public protocol crosses between them: OpenID4VCI offers and requests, `did:web` documents,
status lists, and the presentations on DSP requests.

## The participant credential

An SD-JWT VC (`dc+sd-jwt`, configuration `facis_participant_sd_jwt` in
[`schemas/credentials`](../../schemas/credentials/README.md)):

| Claim | Content |
|---|---|
| `iss` | The issuer's DID (`did:web`), on the verifier's trusted-issuer list |
| `sub` | The participant's DID (`did:web`): the identity the counterparty sees |
| `vct` | The participant credential type |
| `cnf.jwk` | The key the credential binds: the participant tenant's key, which must also be a key of the `sub` DID document |
| `status.status_list` | `idx` and `uri` of its entry in the issuer's status list (IETF Token Status List) |
| `legalName`, `participantRoles`, `trustFramework`, `dspEndpoint` | As in `FacisParticipantCredential.schema.json`; `participantRoles` is a subset of `data_provider`, `data_consumer` |
| `iat`, `exp`, `nbf` | Validity |

## Receiving it (F1)

The issuer gives the participant an offer link (pre-authorized code). The participant's
administrator hands it to the connector:

```
POST /iam/credentials/offers
Authorization: Bearer <DSP_ADMIN_TOKEN>
{"offer": "openid-credential-offer://?credential_offer=..."}
```

`{"credential_offer_uri": "https://..."}` and `{"credential_offer": {...}}` are accepted too. The
connector has its tenant's retrieval service resolve the offer, then accepts it only when:

- the offering issuer is trusted: a DID of `DSP_TRUSTED_ISSUERS`, whose `did:web` is the offer's
  `credential_issuer` URL;
- every offered configuration is an SD-JWT VC with the participant credential's `vct`
  (`DSP_PARTICIPANT_VCT`).

It accepts with the tenant's key as holder key: the retrieval service runs OpenID4VCI with a proof
signed by that key and stores the credential in the tenant. Otherwise the offer is refused and
deleted, and nothing is issued.

| Answer | Meaning |
|---|---|
| `201` `{status: "stored", requestId, issuer, configurations}` | Stored. The credential itself is never returned |
| `401` | No or wrong admin token, or none configured |
| `400` | No readable offer |
| `403` `{error: "offer_refused", reason}` | Untrusted issuer or not a participant credential; the offer is deleted |
| `502` | The retrieval service couldn't resolve the offer, or couldn't obtain the credential |

## Presenting it (F5)

On each DSP request to a provider, the consumer sends:

```
Authorization: Bearer <issuer-signed JWT>~<disclosure>~...~<key-binding JWT>
```

- The credential comes from the tenant's storage (a DCQL query for the participant `vct`).
- The tenant's crypto provider adds the key-binding JWT (`typ` `kb+jwt`), signed with the tenant's
  key: `aud` is the provider's base URL as the consumer calls it, `nonce` is fresh for every
  presentation, `iat` is the signing time, and `sd_hash` covers what is presented.
- The disclosures listed in `DSP_IAM_DISCLOSE` are presented when the credential holds them.

## Verifying it (F4)

The provider refuses the request (401, body `dspace:Error` with a `dspace:code`) unless every check
passes. Verification is mandatory (`DSP_IAM_ENFORCE=enforce`, the default). A failed or unreachable
check refuses, and every decision is logged with a correlation id (`X-Correlation-Id`).

| Check | Refusal code |
|---|---|
| A Bearer SD-JWT VC presentation with a key binding | `missing_authorization`, `invalid_presentation` |
| The key binding is signed by the key in `cnf.jwk` and covers exactly the presented disclosures (`sd_hash`); every disclosure is one the issuer committed to | `holder_binding_failed`, `invalid_presentation` |
| `aud` is one of `DSP_IAM_AUDIENCE` (the provider's own base URL) | `invalid_audience` |
| `iat` within `DSP_IAM_VP_TTL_SECONDS` (300 s by default) | `token_expired` |
| `nonce` not seen within that lifetime | `replay_detected` |
| The credential's `vct` is the participant credential's, it's within its validity, `sub` is a `did:web`, it has a status entry | `invalid_credential`, `token_expired` |
| `iss` in `DSP_TRUSTED_ISSUERS` | `untrusted_issuer` |
| The issuer's signature, checked by the provider's own tenant crypto provider | `invalid_signature` |
| The status list token is signed by a key of the issuer's DID, is the list the credential points to, and the entry is 0 | `status_unavailable`, `credential_revoked` |
| `cnf.jwk` is a key of the `sub` DID document: the presenter is that participant | `holder_binding_failed` |

A nonce is spent only once all the checks have passed, so a refused token can't consume a real one.
DID documents are cached for `DSP_IAM_DID_CACHE_TTL_SECONDS` (300 s by default). On success the
counterparty's identity is `{did: sub, roles: participantRoles, issuer, legalName}`.

## Negotiation

A negotiation request is stored as `REQUESTED`. The connector asks the policy engine
(`OCM_POLICY_URL`, the bundle in [`infrastructure/opa/bundle`](../../infrastructure/opa/README.md))
for `facis/negotiation/permit` with the verified identity and the offer. It is `FINALIZED` with an
agreement when allowed, `TERMINATED` with the reason when denied, and stays `REQUESTED` (502) when
the policy engine doesn't answer.

## Settings

The connector's identity settings, their chart values and a local check against a W-Stack are in
[`services/dsp-connector/local/README.md`](../../services/dsp-connector/local/README.md) and the
chart's `values.yaml` (`dsp.iam.*`).

## Known limits

- `GET /dsp/transfers/:id` isn't checked by `iam.verify`, as before this change. The consumer
  reuses the presentation of its `POST /dsp/transfers` for it; if that route is ever checked, the
  consumer must present again with a new nonce.
- DSP has no challenge step, so the nonce is the presenter's. Replay protection rests on the short
  key-binding lifetime and the provider's nonce cache, which lives in one ORCE instance (the
  connector runs one replica).
- The local check uses one W-Stack tenant as both issuer and participant. A deployment has
  separate ones.
