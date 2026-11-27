#!/usr/bin/env bash
# Copies the login provider flow (services/guard/orce/flows) into the chart's
# files/orce-flows, which the chart mounts into its ORCE. Run it after any
# change to the flow, before packaging or installing the chart.
set -Eeuo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
src="${here}/../../orce/flows"
dest="${here}/files/orce-flows"
[ -d "${src}" ] || { echo "error: ${src} not found" >&2; exit 1; }
mkdir -p "${dest}"
find "${dest}" -maxdepth 1 -type f -name '*.json' -delete
cp -v "${src}"/*.json "${dest}/"
