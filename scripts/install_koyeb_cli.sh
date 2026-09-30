#!/usr/bin/env bash
set -euo pipefail

version=5.10.2
archive="koyeb-cli_${version}_linux_amd64.tar.gz"
release_url="https://github.com/koyeb/koyeb-cli/releases/download/v${version}"
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

curl --fail --show-error --silent --location --proto '=https' --tlsv1.2 \
  --output "$workdir/$archive" "$release_url/$archive"
curl --fail --show-error --silent --location --proto '=https' --tlsv1.2 \
  --output "$workdir/checksums.txt" "$release_url/checksums.txt"
(
  cd "$workdir"
  grep -F "  $archive" checksums.txt > archive.sha256
  test -s archive.sha256
  sha256sum --check --strict archive.sha256
  tar -xzf "$archive"
)
install -d -m 0755 "$HOME/.local/bin"
install -m 0755 "$workdir/koyeb" "$HOME/.local/bin/koyeb"
echo "$HOME/.local/bin" >> "$GITHUB_PATH"
