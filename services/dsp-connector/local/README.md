# Local check: the connector's identity against a W-Stack

How to check the DSP connector's identity flows against a real OCM W-Stack on your machine. The
connector:

1. **accepts** its participant credential, offered by the issuer, into its own W-Stack tenant (its
   wallet), and refuses an offer from an issuer it doesn't trust;
2. **presents** that credential to a counterparty: the tenant's storage gives the credential, the
   tenant's crypto provider adds the key binding with the tenant's key;
3. **verifies** a counterparty's presentation: key binding, audience, nonce, the issuer's signature
   (crypto provider), the status list and the participant's `did:web`, and refuses a replayed
   presentation and a key binding signed by another key.

Local tests only. The flows run outside ORCE (`flow-run.js`): their function nodes, through the same
sandbox as the flow tests, with real HTTP calls.

## What it needs

- A local W-Stack: [`infrastructure/wstack/local/README.md`](../../../infrastructure/wstack/local/README.md).
  Its tenant plays both roles here: the issuer, and the participant that holds the credential.
- kubectl, Node.js 20+, curl, jq.
- The settings of that W-Stack. Its `up.sh` records the zone in its state folder:

  ```bash
  S=~/.local/state/facis-wstack-local/<cluster>          # wstack by default
  . "$S/zone.env"
  export WSTACK_CONTEXT=kind-<cluster>
  export WSTACK_HOST=connector.$WSTACK_ZONE              # the tenant host
  export CA_FILE=$S/ca/ca.crt                            # the local CA of its certificate
  ```

The other settings have defaults that fit the local W-Stack (header of `wstack-identity-check.sh`):
namespace `ocm-wstack`, tenant `connector`, key group `default` and key `eckey`, region `EU` and
country `DE` (where the retrieval service files credentials), and the issuer configuration
`SDJWTCredential` (an SD-JWT VC).

## Run it

From the repository root:

```bash
services/dsp-connector/local/wstack-identity-check.sh
```

It port-forwards the tenant's crypto provider, storage and retrieval service (a connector deployed
in the cluster reaches them directly), has the issuer mint two offers from a short-lived pod, then
runs the checks. Expected output:

```
== 1. accept the participant credential into the tenant wallet
  ok    offer accepted and stored (201)
== 2. an offer from an issuer the connector does not trust
  ok    refused (403) and the offer deleted
== 3. present it to a counterparty
  ok    presentation from the tenant storage, key binding by the crypto provider
== 4. the counterparty verifies it
  ok    accepted, identity did:web:connector.<zone> with roles ["data_provider","data_consumer"]
== 5. refusals
  ok    the same presentation again: replay_detected
  ok    key binding signed by another key: holder_binding_failed

6 passed, 0 failed
```

It writes to the W-Stack: one participant credential in the tenant's storage, its status list entry,
and one refused offer, which is deleted. Running it again adds another credential; the connector
presents the one that expires last.

## The connector's settings it uses

The same ones a deployed connector reads (ORCE environment):

| Setting | For | Here |
|---|---|---|
| `DSP_ADMIN_TOKEN` | the admin token of `POST /iam/credentials/offers` (empty refuses every call) | a random one |
| `DSP_TRUSTED_ISSUERS` | the issuers whose credentials are accepted and verified | the tenant's DID |
| `DSP_PARTICIPANT_VCT` | the participant credential type (`vct`) | the configuration's `vct`, from the issuer metadata |
| `DSP_IAM_AUDIENCE` | the audiences this connector accepts in presentations | a test endpoint |
| `OCM_RETRIEVAL_URL`, `OCM_STORAGE_URL`, `OCM_CRYPTO_URL` | the tenant's retrieval service, storage and crypto provider | the port-forwards |
| `OCM_TENANT`, `OCM_ACCOUNT`, `OCM_REGION`, `OCM_COUNTRY` | the tenant, and where its credentials are filed | `connector`, `default`, `EU`, `DE` |
| `OCM_KEY_NAMESPACE`, `OCM_KEY_GROUP`, `OCM_KEY` | the tenant's key, which signs the key bindings | `ocm-wstack`, `default`, `eckey` |

## Accept an offer by hand

With the connector deployed, the participant's administrator accepts an offer from the federation
issuer with:

```bash
curl -X POST https://<connector>/iam/credentials/offers \
  -H "Authorization: Bearer $DSP_ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"offer": "openid-credential-offer://?credential_offer=..."}'
```

`201` means stored. `403` means refused (the issuer isn't trusted, or it isn't a participant
credential), and the offer is deleted. The answer never contains the credential.
