# Local W-Stack on kind

The OCM W-Stack (issuer, verifier, status lists, signer and their infrastructure) on a one-node
kind cluster on your machine, installed from the charts of
[eclipse-xfsc/deployment](https://github.com/eclipse-xfsc/deployment) at the commit pinned in
[`../wstack-images.lock.tsv`](../wstack-images.lock.tsv), with one tenant whose DID is
`did:web:<tenant>.<zone>`. It is what the guard's level-2 test runs against
([`services/guard/local/README.md`](../../../services/guard/local/README.md), Part B): a test
wallet receives an SD-JWT VC from this issuer and presents it to this verifier.

Local tests only: self-signed and local-CA certificates, dev-sized databases, the workarounds
listed below. It is not a deployment guide; on a real cluster the W-Stack comes from the XFSC
ApplicationSets or the Easy Stack Builder.

All paths below are from the repository root.

## 0. Prerequisites

| What | Why |
|---|---|
| Docker Engine 20.10+, kind 0.20+, kubectl, helm 3.8+ or 4, jq, curl, openssl, python3 | the scripts |
| About 10 GiB of free memory | the node runs some 25 containers, Cassandra and Postgres among them |
| `fs.inotify.max_user_instances` ≥ 1024 | with the default 128 the containers run out of inotify instances and fail at random: `sudo sysctl fs.inotify.max_user_instances=1024` (persist it in `/etc/sysctl.d/`) |
| A clone of `eclipse-xfsc/deployment` at the pinned commit | the charts |
| Internet access | images from the public XFSC registry and Docker Hub, chart dependencies, the Calico manifest |

The `deployment` clone goes next to this repository by default (`DEPLOYMENT_DIR` to change it),
checked out at the commit on the first line of the lock file:

```bash
git clone https://github.com/eclipse-xfsc/deployment.git ../deployment
git -C ../deployment checkout "$(sed -n '1s/^# deployment @ \([0-9a-f]*\).*/\1/p' infrastructure/wstack/wstack-images.lock.tsv)"
```

`up.sh` refuses another commit (`ALLOW_UNPINNED=1` to deploy one knowingly): `deployment`'s main
branch moves almost daily and changes chart versions.

## 1. Settings

```bash
cp infrastructure/wstack/local/settings.example.env infrastructure/wstack/local/settings.env   # ignored by git
```

Nothing is required. The setting that matters is **`WSTACK_ZONE`**, a wildcard DNS zone whose
names resolve to the node's address: wallets, the guard and the W-Stack's own services all reach
the tenant as `<TENANT>.<WSTACK_ZONE>` (default tenant `connector`).

**Without it**, `up.sh` creates the cluster first, reads the node's address and uses
`<address>.sslip.io`, a public wildcard DNS name that resolves to that address with no setup. It
keeps the zone and the address in `$WSTACK_STATE_DIR/zone.env`: later runs and `resume.sh` use
the same, and refuse to run if the node comes back with another address.

**With your own zone**, set `WSTACK_ZONE` (and `WSTACK_NODE_IP` to the address it resolves to);
create the cluster first to learn the address, `up.sh` reuses it.

Either way, give the node a Docker network of its own, so it keeps the same address across
restarts: `docker network create wstack`, then `WSTACK_NETWORK=wstack`.

The other settings have defaults (cluster `wstack`, context `kind-wstack`, namespace
`ocm-wstack`, gateway nodePort 32091); see `settings.example.env`. The environment can set any
of them too.

## 2. Bring it up

```bash
infrastructure/wstack/local/up.sh --check     # the plan, the pin, the chart paths; touches no cluster
infrastructure/wstack/local/up.sh             # the first run pulls many images: allow time
```

Every step is idempotent: re-run it after a failure. It installs, in order:

1. **The cluster:** kind without a CNI, then Calico (so NetworkPolicies are enforced),
   ingress-nginx (TLS 1.3, ports 80/443 of the node), cert-manager with a self-signed
   `ClusterIssuer`, the External Secrets Operator.
2. **The W-Stack, as its ApplicationSets install it:** OpenBao, the XFSC kubernetes-operator, the
   Postgres and Redis operators, Postgres, Redis, Cassandra, NATS, the universal resolver, the
   envoy gateway, the namespaces' OpenBao access, every chart of `OCM W-Stack/` except those the
   ApplicationSet excludes (tenant, Policies, Didcomm, Tools), and the tenant chart.
3. **What wallets and relying parties need locally:**
   - the tenant's signing key in OpenBao;
   - a local CA and the tenant host's certificate;
   - the tenant's `did:web` document on `https://<tenant host>/.well-known/did.json`, inside the
     cluster too;
   - the local CA trusted by the W-Stack services;
   - the verifier's presentation profile for wallet logins;
   - the tenant registrations.

At the end it prints the tenant's DID, the CA file (`$WSTACK_STATE_DIR/ca/ca.crt`, by default
under `~/.local/state/facis-wstack-local/`) and the TLS secret of the tenant host
(`wstack-local/tenant-tls`).

**Check it:**

```bash
S=~/.local/state/facis-wstack-local/wstack     # .../<WSTACK_CLUSTER>
. $S/zone.env
kubectl --context kind-wstack get pods -A | grep -vE 'Running|Completed'          # only the header line
curl -s --cacert $S/ca/ca.crt https://connector.$WSTACK_ZONE/.well-known/did.json | jq .id
```

The second command prints the tenant's DID. The `did:web` document is served on 443 by the
ingress, with the local CA. The tenant gateway's nodePort (32091) carries the issuer's API with
the cluster's own self-signed certificate, and serves no `did.json`. The issuer's metadata,
nonce, credential and status list URLs answer on 443 once the guard's
`services/guard/local/wstack/public-routes.sh` has added their routes (Part B, step B3, of
`services/guard/local/README.md`); before that they answer 404 there.

## What runs where

| Namespace | Contents |
|---|---|
| `security` | OpenBao (initialized and unsealed by its bootstrap job; unseal shares and root token in secret `openbao-bootstrap-root`), the XFSC kubernetes-operator |
| `infrastructure` | NATS, Postgres (CloudNativePG), Redis, Cassandra, the universal resolver, the envoy gateway (the tenant's HTTPS listener on nodePort `GW_NODEPORT`) |
| `ocm-wstack` | the W-Stack services (issuance, credential retrieval, verification, status lists, storage, well-known, signer, SD-JWT service, dummy content signer) and the tenant: its listener and routes on the envoy gateway, its certificate, its transit key in OpenBao |
| `wstack-local` | local only: the tenant host's certificate (`tenant-tls`) and the `did:web` ingress |
| `ingress-nginx`, `cert-manager`, `external-secrets`, `kube-system` | the cluster's own services; ingress-nginx serves the tenant host on 443 |

How the pieces find each other:

- **The XFSC kubernetes-operator injects dependencies.** Infrastructure charts announce
  themselves as resource providers. Workloads declare what they need (`inject.xfsc.io/needs`),
  and the operator fills in their NATS, database, signer and resolver settings.
- **External Secrets turns OpenBao paths into Kubernetes secrets.** Each namespace has its
  OpenBao access from the app-namespace chart, and the database users come from the operator's
  ResourceClaims.
- **The tenant's DID document is served by the signer.** The signer reads the tenant's transit
  key at `<namespace>/<group>/keys/<key>` in OpenBao, and the tenant's headers (`X-DID`, `X-KEY`,
  `X-NAMESPACE`, ...) tell it which one.

## Local workarounds

Each is applied by `up.sh`, and each is a fault of the pinned release, not a choice:

| What | Why |
|---|---|
| A patched copy of the app-namespace chart | Its hook reads the type of an existing secrets engine with a `sed` over JSON that stops at the first nested `}`. On OpenBao 2.5 it never finds it, so every re-run of a namespace's access fails. The copy reads the table format. |
| A patched copy of the cassandra chart, small heap | The chart sets the heap on the init container only, so the main container sizes its heap from the host's memory. It is then killed at its limit, or restarted in a loop by 1 s probes. |
| Prometheus CRDs (no Prometheus) | The OpenBao and Postgres charts render monitoring objects unconditionally. |
| helm `--wait=hookOnly` | helm 4 runs post-install hooks only after the wait. |
| The envoy gateway as a NodePort, its 443 listener pinned to `GW_NODEPORT` | The chart's cloud LoadBalancer stays pending on kind. |
| The tenant's transit key created in OpenBao | The tenant chart's hook does not create it where the signer reads it. |
| `tenant.group` and `openbao.transit.mountPath` set | The upstream values default the group to `demo-tenant`. |
| A `selfsigned-issuer` for the tenant's gateway certificate | The upstream values name a public ACME issuer. |
| Tenant registrations repeated | The tenant-aware services and the dummy content signer keep registrations in memory: after a restart they answer "tenant not registered" until the tenant's cron job runs again, every 15 minutes. |
| A CA bundle mounted as `SSL_CERT_FILE` in the W-Stack services; a truststore in the universal resolver | They fetch DID documents and status lists over HTTPS with certificates from the local CA. |

The guard's level-2 test adds its own changes on top (newer verifier and SD-JWT service releases,
public routes); see `services/guard/local/wstack/`.

## After a reboot

The kind node restarts with Docker, but the W-Stack doesn't come back by itself:

```bash
infrastructure/wstack/local/resume.sh --check   # what it would do
infrastructure/wstack/local/resume.sh
```

It does the following:

1. Restarts Calico when new pods can't start (a stale CNI token).
2. Unseals OpenBao from the bootstrap shares.
3. Waits for the operator's database users, nudging it out of its back-off.
4. Revalidates the secret stores, which External Secrets marked invalid while OpenBao was sealed,
   and resyncs every ExternalSecret.
5. Restarts the deployments that crash-looped meanwhile, and the services left without a NATS
   connection.
6. Registers the tenant again.

**If the node's address changed** (another container on the same Docker network started first),
`resume.sh` refuses to run: stop the other container, restart the node
(`docker restart <WSTACK_CLUSTER>-control-plane`), then start the other container again.

## Use it from the guard's level-2 test

The guard's scripts in `services/guard/local/wstack/` take this W-Stack's values as settings:

```bash
. ~/.local/state/facis-wstack-local/wstack/zone.env   # WSTACK_ZONE and WSTACK_NODE_IP, when up.sh picked them
export WSTACK_CONTEXT=kind-wstack WSTACK_NODE=wstack-control-plane WSTACK_NETWORK=<WSTACK_NETWORK> WSTACK_NODE_IP=<WSTACK_NODE_IP>
export WSTACK_HOST=connector.<WSTACK_ZONE>
export TLS_SECRET=wstack-local/tenant-tls
export CA_FILE=~/.local/state/facis-wstack-local/wstack/ca/ca.crt NODE_EXTRA_CA_CERTS="$CA_FILE"
export VERIFIER_URL=http://<WSTACK_NODE_IP>:32093           # expose-verifier.sh's nodePort
export VCT=https://connector.<WSTACK_ZONE>/api/schema/SD_JWT_DEVELOPER_CREDENTIAL
export ORG_DID=did:web:connector.<WSTACK_ZONE> E2E_ISSUER=did:web:connector.<WSTACK_ZONE> E2E_ORG=did:web:connector.<WSTACK_ZONE>
```

Then follow Part B of `services/guard/local/README.md`, from B2. Its `connect-clusters.sh` joins the
guard's node to `WSTACK_NETWORK`. Start the W-Stack's node before the guard's after a reboot, so
the W-Stack's node keeps its address.

## Troubleshooting

| Symptom | Cause, fix |
|---|---|
| New pods stay in `ContainerCreating`: `plugin calico ... Unauthorized` | A stale Calico token after a reboot: `resume.sh`. |
| `storage-service` crash-loops: "Vault is sealed" | OpenBao is sealed: `resume.sh`. |
| `pre-authorization-bridge` crash-loops: Redis `WRONGPASS` | Redis lost its users while OpenBao was sealed: `resume.sh`. |
| ExternalSecrets `SecretSyncedError`, stores `InvalidProviderConfig` | The stores were checked while OpenBao was sealed: `resume.sh`. |
| "tenant ... not registered" from the issuer or the signer | `resume.sh`, or wait for the cron job (15 minutes). |
| A helm step refused by `workload-injection.resources.xfsc.io` | The operator's webhook wasn't serving yet. Re-run `up.sh`; it waits for it. |
| Cassandra restarts in a loop | Not enough memory for the node. Check `docker stats`; the chart copy asks for 1 GiB, limit 3 GiB. |
| `up.sh` fails at the pin check | The `deployment` clone isn't at the lock's commit: check it out (see step 0). |
| Containers fail at random, "too many open files" | `fs.inotify.max_user_instances` is too low (see step 0). |
| The did:web document can't be fetched from inside the cluster | CoreDNS has no entry for the tenant host, or the local CA isn't trusted. Re-run `up.sh`; its did:web and CA steps are idempotent. |

## Remove it

```bash
infrastructure/wstack/local/down.sh            # the kind cluster
infrastructure/wstack/local/down.sh --purge    # and the local CA and chart copies
```

## Not covered

- **Keycloak and PCM Cloud:** they aren't part of the `ocm-wstack` ApplicationSet.
- **The W-Stack's network policies:** `up.sh` applies `infrastructure/networkpolicy/identity-ingress.yaml`
  when this checkout has it. Without it, the W-Stack namespaces stay open to every pod.
- **The FAP's own services:** they have their own charts and local setups.
