#!/usr/bin/env bash
set -euo pipefail

missing=()
for name in KOYEB_TOKEN KOYEB_SERVICE EXPECTED_DEPLOYMENT_SHA; do
  if [ -z "${!name:-}" ]; then
    missing+=("$name")
  fi
done
if [ "${#missing[@]}" -gt 0 ]; then
  printf '::error::MAST Worker/API smoke cannot run. Missing required configuration: %s\n' "${missing[*]}" >&2
  exit 1
fi
if [[ ! "$EXPECTED_DEPLOYMENT_SHA" =~ ^[[:xdigit:]]{40}$ ]]; then
  echo '::error::Expected MAST deployment SHA must be a full 40-digit hex commit.' >&2
  exit 1
fi

# The Worker receives its HIVE/RAMS credentials from Koyeb at runtime. The
# remote script checks KOYEB_GIT_SHA before probing any downstream service.
koyeb services exec "$KOYEB_SERVICE" node -- /app/scripts/ecosystemSmoke.js --worker "$EXPECTED_DEPLOYMENT_SHA"
