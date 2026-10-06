#!/usr/bin/env bash
set -euo pipefail

kind="${1:?usage: persist_r2_evidence.sh <kind> <exact-sha> <path>}"
exact_sha="${2:?exact sha required}"
source_path="${3:?file or directory required}"

: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY required}"
: "${GITHUB_RUN_ID:?GITHUB_RUN_ID required}"
: "${GITHUB_RUN_ATTEMPT:?GITHUB_RUN_ATTEMPT required}"
: "${R2_ENDPOINT:?R2_ENDPOINT secret required}"
: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID secret required}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY secret required}"

bucket="${R2_BUCKET_REPOSITORIES:-hive-repositories}"
if [[ "$bucket" != "hive-repositories" ]]; then
  echo "::error::Repository evidence must use the existing hive-repositories bucket, got: $bucket"
  exit 1
fi
if [[ ! "$R2_ENDPOINT" =~ ^https://[^/]+\.r2\.cloudflarestorage\.com/?$ ]]; then
  echo "::error::R2_ENDPOINT must be the private Cloudflare R2 S3 endpoint."
  exit 1
fi
if [[ ! "$exact_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "::error::Exact SHA is not a full 40-character commit SHA."
  exit 1
fi
if [[ ! -e "$source_path" ]]; then
  echo "::error::Evidence path does not exist: $source_path"
  exit 1
fi

repo_key="${GITHUB_REPOSITORY////_}"
prefix="repository-evidence/${repo_key}/${kind}/${exact_sha}/run-${GITHUB_RUN_ID}/attempt-${GITHUB_RUN_ATTEMPT}"
endpoint="${R2_ENDPOINT%/}"

upload_one() {
  local file="$1"
  local relative="$2"
  local key="${prefix}/${relative}"
  echo "Persisting evidence: s3://${bucket}/${key}"
  curl --fail-with-body --silent --show-error \
    --retry 3 --retry-delay 2 --retry-all-errors \
    --aws-sigv4 "aws:amz:auto:s3" \
    --user "${R2_ACCESS_KEY_ID}:${R2_SECRET_ACCESS_KEY}" \
    --header "Content-Type: application/octet-stream" \
    --upload-file "$file" \
    "${endpoint}/${bucket}/${key}"
}

if [[ -d "$source_path" ]]; then
  found=false
  while IFS= read -r -d '' file; do
    found=true
    relative="${file#"$source_path"/}"
    upload_one "$file" "$relative"
  done < <(find "$source_path" -type f -print0)
  if [[ "$found" != true ]]; then
    echo "::error::Evidence directory is empty: $source_path"
    exit 1
  fi
else
  upload_one "$source_path" "$(basename "$source_path")"
fi

printf 'R2_PREFIX=%s\n' "$prefix" >> "$GITHUB_ENV"
