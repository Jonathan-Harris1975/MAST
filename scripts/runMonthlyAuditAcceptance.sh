#!/usr/bin/env bash
# Short provider exec sessions keep observation independent of a long-lived
# WebSocket. All source starts remain guarded by canonical durable job lookups.
set -euo pipefail
: "${KOYEB_TOKEN:?Existing Koyeb token is required}"
: "${KOYEB_SERVICE:?Existing MAST service identity is required}"
: "${AUDIT_ACCEPTANCE_ID:?Exact acceptance identity is required}"
case "${AUDIT_ACCEPTANCE_KIND:-both}" in
  both) selected=(website content) ;;
  website|content) selected=("$AUDIT_ACCEPTANCE_KIND") ;;
  *) echo 'Unsupported acceptance selection' >&2; exit 1 ;;
esac
export AUDIT_ACCEPTANCE_CODE AUDIT_ACCEPTANCE_SINGLE_PASS=1
AUDIT_ACCEPTANCE_CODE="$(base64 -w0 scripts/monthlyAuditAcceptance.js)"
work_dir="$(mktemp -d)"
failed=0
pending=1
for round in $(seq 1 180); do
  pending=0
  for kind in "${selected[@]}"; do
    test ! -f "$work_dir/$kind.finished" || continue
    export AUDIT_ACCEPTANCE_KIND="$kind" AUDIT_ACCEPTANCE_SESSION_ID=""
    if test -f "$work_dir/$kind.session"; then AUDIT_ACCEPTANCE_SESSION_ID="$(cat "$work_dir/$kind.session")"; fi
    log_file="$work_dir/$kind.log"
    # The child shell expands existing runtime configuration, not user input.
    # shellcheck disable=SC2016
    timeout 300 script -q -e -c 'koyeb services exec "$KOYEB_SERVICE" env -- AUDIT_ACCEPTANCE_REMOTE=1 AUDIT_ACCEPTANCE_SINGLE_PASS=1 AUDIT_ACCEPTANCE_ID="$AUDIT_ACCEPTANCE_ID" AUDIT_ACCEPTANCE_KIND="$AUDIT_ACCEPTANCE_KIND" AUDIT_ACCEPTANCE_SESSION_ID="$AUDIT_ACCEPTANCE_SESSION_ID" node --input-type=module -e '\''await import("data:text/javascript;base64," + process.argv[1]);'\'' "$AUDIT_ACCEPTANCE_CODE"' /dev/null < /dev/null > "$log_file" 2>&1 || true
    result="$(node --input-type=module - "$log_file" <<'JS'
import fs from 'node:fs';
const marker='AUDIT_ACCEPTANCE_RESULT=';
const lines=fs.readFileSync(process.argv[2],'utf8').split(/\r?\n/).filter(line=>line.includes(marker));
if(lines.length){try{const value=JSON.parse(lines.at(-1).split(marker).at(-1).trim());console.log(JSON.stringify(value));}catch{}}
JS
)"
    if test -z "$result"; then
      count_file="$work_dir/$kind.errors"
      errors=0
      if test -f "$count_file"; then errors="$(cat "$count_file")"; fi
      errors=$((errors + 1))
      echo "$errors" > "$count_file"
      echo "$kind observation transport failed ($errors/5); its source job remains unverified."
      # A lifecycle pause can interrupt the provider exec. Request resume using
      # the existing service identity; the next actual probe verifies readiness.
      curl --silent --show-error --connect-timeout 10 --max-time 30 --request POST \
        --header "Authorization: Bearer $KOYEB_TOKEN" --header 'Content-Type: application/json' --data '{}' \
        "https://app.koyeb.com/v1/services/$KOYEB_SERVICE/resume" > "$work_dir/resume-response.json" || true
      if test "$errors" -ge 5; then failed=1; touch "$work_dir/$kind.finished"; else pending=1; fi
      continue
    fi
    echo "$result"
    echo 0 > "$work_dir/$kind.errors"
    status="$(RESULT_JSON="$result" node --input-type=module -e 'console.log(JSON.parse(process.env.RESULT_JSON).status)')"
    session_id="$(RESULT_JSON="$result" node --input-type=module -e 'const id=JSON.parse(process.env.RESULT_JSON).sessionId;if(/^[A-Za-z0-9_-]{1,128}$/.test(id||""))console.log(id)')"
    if test -n "$session_id"; then echo "$session_id" > "$work_dir/$kind.session"; fi
    if test -z "$session_id" && [[ "$status" =~ ^(queued|accepted|running)$ ]]; then
      echo "Pending $kind observation omitted a safe canonical identity" >&2
      failed=1; touch "$work_dir/$kind.finished"; continue
    fi
    case "$status" in
      completed) touch "$work_dir/$kind.finished" ;;
      failed) failed=1; touch "$work_dir/$kind.finished" ;;
      queued|accepted|running) pending=1 ;;
      *) echo "Invalid $kind observation status" >&2; failed=1; touch "$work_dir/$kind.finished" ;;
    esac
  done
  if test "$pending" -eq 0; then break; fi
  echo "Acceptance observation round $round remains pending."
  sleep 30
done
if test "$pending" -ne 0; then echo 'Acceptance window expired; repair completion remains unverified.' >&2; exit 1; fi
exit "$failed"
