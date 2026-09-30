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

# The Koyeb CLI requires terminal stdin even when the remote command itself
# does not need input. `script` provides a PTY and preserves the exit status.
# Quoting the command here keeps the service and SHA as shell variables in the
# child process, never as interpolated shell source or printed credentials.
# The Worker reads its HIVE/RAMS keys from Koyeb and checks its Git SHA first.
script -q -e -c 'koyeb services exec "$KOYEB_SERVICE" node -- /app/scripts/ecosystemSmoke.js --worker "$EXPECTED_DEPLOYMENT_SHA"' /dev/null < /dev/null
