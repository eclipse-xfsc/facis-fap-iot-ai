#!/usr/bin/env python3
"""Build the OID4VCI credential_configurations_supported entries for the three credentials.

Reads the *.schema.json files and writes generated/issuer-credential-configurations.json in
the shape the OCM W-Stack well-known service (1.5.2) stores: OID4VCI 1.0 fields plus the
W-Stack's 'schema' (credentialSubject, references inlined) and 'topic' (the NATS subject of
the issuing plugin). The issuing plugin registers them over NATS
'wellknown.issuer.registration'. Two formats per credential:
  - jwt_vc_json (<id>_jwt): claims under credentialSubject;
  - SD-JWT VC, dc+sd-jwt (<id>_sd_jwt): claims at the top level, the subject DID in `sub`,
    the type in `vct` (<vct base>/<credential type>), the holder key in `cnf`.

Usage: python3 schemas/credentials/tools/build-issuer-metadata.py [--topic-prefix PREFIX]
                                                                 [--vct-base URL] [--check]
  --check   do not write; exit 1 if the committed file differs from what the schemas produce
"""
import argparse
import copy
import json
import sys
from pathlib import Path

SCHEMAS = Path(__file__).resolve().parent.parent
CONTEXT = "https://schemas.facis.example/v1/facis.context.jsonld"
VCT_BASE = "https://schemas.facis.example/v1/vct"
CREDENTIALS = {
    "FacisParticipantCredential": (
        "facis_participant_jwt",
        "FACIS Participant Credential",
        "Organisational credential of a FAP participant.",
    ),
    "FapIotAiRoleCredential": (
        "fap_iotai_role_jwt",
        "FAP IoT & AI Role Credential",
        "Role of a person in the FAP IoT & AI.",
    ),
    "FapServiceCredential": (
        "fap_service_jwt",
        "FAP Service Credential",
        "Identity of a FAP machine client.",
    ),
}
ALGS = ["ES256"]


def inline(node, defs):
    """Replace $ref to facis-common.schema.json#/$defs/<name> by the definition itself."""
    if isinstance(node, dict):
        ref = node.get("$ref", "")
        if ref.startswith("facis-common.schema.json#/$defs/"):
            target = inline(copy.deepcopy(defs[ref.rsplit("/", 1)[1]]), defs)
            rest = {k: inline(v, defs) for k, v in node.items() if k != "$ref"}
            return {**target, **rest}
        if ref.startswith("#/$defs/"):
            return inline(copy.deepcopy(defs[ref.rsplit("/", 1)[1]]), defs)
        return {k: inline(v, defs) for k, v in node.items()}
    if isinstance(node, list):
        return [inline(v, defs) for v in node]
    return node


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--topic-prefix", default="fap.iotai.TENANT")
    parser.add_argument("--vct-base", default=VCT_BASE)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    defs = json.loads((SCHEMAS / "facis-common.schema.json").read_text())["$defs"]
    configurations = {}
    for vc_type, (config_id, name, description) in CREDENTIALS.items():
        schema = json.loads((SCHEMAS / f"{vc_type}.schema.json").read_text())
        subject = inline(schema["properties"]["credentialSubject"], defs)
        claims = [
            {"path": ["credentialSubject", claim], "mandatory": claim in subject["required"]}
            for claim in subject["properties"]
            if claim != "id"
        ]
        configurations[config_id] = {
            "format": "jwt_vc_json",
            "scope": config_id,
            "cryptographic_binding_methods_supported": ["jwk", "did:web", "did:key"],
            "credential_signing_alg_values_supported": ALGS,
            "credential_definition": {
                "@context": ["https://www.w3.org/2018/credentials/v1", CONTEXT],
                "type": ["VerifiableCredential", vc_type],
            },
            "proof_types_supported": {"jwt": {"proof_signing_alg_values_supported": ALGS}},
            "credential_metadata": {
                "claims": claims,
                "display": [{"name": name, "locale": "en", "description": description}],
            },
            "schema": subject,
            "topic": f"{args.topic_prefix}.{config_id}",
        }
        sd_id = config_id[: -len("_jwt")] + "_sd_jwt"
        configurations[sd_id] = {
            "format": "dc+sd-jwt",
            "scope": sd_id,
            "vct": f"{args.vct_base}/{vc_type}",
            "cryptographic_binding_methods_supported": ["jwk"],
            "credential_signing_alg_values_supported": ALGS,
            "proof_types_supported": {"jwt": {"proof_signing_alg_values_supported": ALGS}},
            "credential_metadata": {
                "claims": [{"path": [c["path"][1]], "mandatory": c["mandatory"]} for c in claims],
                "display": [{"name": name, "locale": "en", "description": description}],
            },
            "schema": subject,
            "topic": f"{args.topic_prefix}.{sd_id}",
        }
    out = SCHEMAS / "generated" / "issuer-credential-configurations.json"
    text = json.dumps({"credential_configurations_supported": configurations}, indent=2) + "\n"
    if args.check:
        if not out.is_file() or out.read_text() != text:
            print(f"{out.name} is out of date: run tools/build-issuer-metadata.py")
            return 1
        print(f"{out.name} is up to date ({len(configurations)} configurations)")
        return 0
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text)
    print(f"wrote {out} ({len(configurations)} configurations)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
