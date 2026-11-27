#!/usr/bin/env bash
# Replays the decision fixtures against the policy bundle with `opa eval`,
# without a server. Each fixture names a query (data path), an input and the
# expected verdict ("allow" or "deny"). Exits non-zero if any fixture gets
# another verdict.
#
# Usage: infrastructure/opa/check-fixtures.sh            (from the repo root)
# Needs: opa, jq.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
# The fixtures run against a bundle built the way a deployment builds it: the
# policies plus deployment data (fixtures/deployment-data, an example of it).
work="$(mktemp -d)"
trap 'rm -rf "${work}"' EXIT
bundle="${work}/bundle.tar.gz"
opa build "${here}/bundle" "${here}/fixtures/deployment-data" -o "${bundle}"
failed=0
total=0

for fixture in "${here}"/fixtures/*.json; do
    name="$(basename "${fixture}" .json)"
    query="$(jq -r '.query' "${fixture}")"
    expect="$(jq -r '.expect' "${fixture}")"
    total=$((total + 1))

    case "${expect}" in
        allow | deny) ;;
        *) echo "FAIL  ${name}: expect must be allow or deny, not '${expect}'"; failed=$((failed + 1)); continue ;;
    esac

    # Evaluate the whole decision, not just .allow: an undefined query (a typo
    # in the path) must fail, not pass as a deny.
    if ! decision="$(jq '.input' "${fixture}" \
        | opa eval --bundle "${bundle}" --stdin-input --format raw \
            "data.${query//\//.}")"; then
        echo "FAIL  ${name}: opa eval failed for ${query}"
        failed=$((failed + 1))
        continue
    fi
    if [ -z "${decision}" ]; then
        echo "FAIL  ${name}: query ${query} is not defined in the bundle"
        failed=$((failed + 1))
        continue
    fi
    if [ "$(jq -r '.allow' <<<"${decision}")" = "true" ]; then got=allow; else got=deny; fi

    if [ "${got}" = "${expect}" ]; then
        echo "ok    ${name}: ${got}"
    else
        echo "FAIL  ${name}: expected ${expect}, got ${got}"
        failed=$((failed + 1))
    fi
done

echo "${total} fixtures, ${failed} failed"
[ "${failed}" -eq 0 ]
