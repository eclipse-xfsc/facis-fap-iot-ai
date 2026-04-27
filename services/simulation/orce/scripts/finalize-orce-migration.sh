#!/usr/bin/env bash
# Finalise the ORCE-native simulation migration.
#
# Run ONLY after the gates documented in services/simulation/orce/DEPRECATED.md
# have been met. This script must run on a dedicated decommission branch so
# the deletion is a separately reviewable PR.
#
# Usage:
#   cd <repo-root>
#   ./services/simulation/orce/scripts/finalize-orce-migration.sh
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "error: must run from inside a git working tree" >&2
    exit 1
fi

BRANCH="$(git branch --show-current)"
if [[ "${BRANCH}" != chore/* ]]; then
    cat >&2 <<'MSG'
error: this script must be run on a chore/* branch (e.g. chore/decommission-python-sim).
The deletion is intentionally a separate PR from the migration itself.
Switch branches and re-run:

  git checkout -b chore/decommission-python-sim
  ./services/simulation/orce/scripts/finalize-orce-migration.sh
MSG
    exit 1
fi

echo "Removing deprecated flow files..."
git rm -f flows/facis-simulation.json flows/facis-simulation-cluster.json

cat <<'NEXT'

Deprecated flow files removed.

Manual follow-up steps:
  1. Remove every reference to compatibilityMode=legacy from
     services/simulation/helm/facis-simulation/templates/.
  2. Delete the values.yaml block for compatibilityMode (default to orce-only).
  3. Move services/simulation/{Dockerfile,pyproject.toml,src} into
     archive/python-simulation/ for one release cycle, then delete.
  4. Update services/simulation/orce/DEPRECATED.md to record completion.

Commit the changes and open a PR titled
"chore(simulation): remove legacy Python runtime and deprecated ORCE flows".
NEXT
