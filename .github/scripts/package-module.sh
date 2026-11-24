#!/usr/bin/env bash
# Build module.json and the zip Foundry installs from a release.
#
# Run from the repository root. GITHUB_REPOSITORY (owner/name) is set by
# GitHub Actions; set it yourself to try this locally. When RELEASE_TAG is set
# (e.g. v2.1.0), module.json's version must match it: release-please tags
# plain vX.Y.Z ("include-component-in-tag": false), and the download URL
# assumes that form.
#
# The zip holds only what the Foundry client loads: module.json, scripts/
# (without the Node build script), lang/, templates/ and the licence and
# readme files. bridge-server/, tests, docs and dev files stay out; the
# bridge is deployed separately (see docs/deployment-production.md).
set -euo pipefail

repo="${GITHUB_REPOSITORY:?set GITHUB_REPOSITORY to owner/name}"
latest_base="https://github.com/${repo}/releases/latest/download"

fail() {
  echo "package-module: $*" >&2
  exit 1
}

# Generate module.json from module.json.template. build.js fills the URLs
# from GITHUB_REPOSITORY and the version from package.json.
node scripts/build.js

if grep -q '{{' module.json; then
  fail "module.json still has unreplaced {{placeholders}}"
fi

# build.js's last-resort fallbacks, which must not ship
if grep -Eq 'example\.com|yourusername|"Your Name"' module.json; then
  fail "module.json still has a placeholder author or repository"
fi

manifest="$(jq -r '.manifest' module.json)"
download="$(jq -r '.download' module.json)"
version="$(jq -r '.version' module.json)"

# The manifest tracks the latest release, so Foundry sees updates; the
# download is this release's own zip, so an older manifest installs its own
# version.
tag_base="https://github.com/${repo}/releases/download/v${version}"

[ "$manifest" = "${latest_base}/module.json" ] ||
  fail "manifest is ${manifest}, expected ${latest_base}/module.json"

case "$download" in
  "${tag_base}/"*.zip) ;;
  *) fail "download is ${download}, expected ${tag_base}/<name>.zip" ;;
esac

if [ -n "${RELEASE_TAG:-}" ] && [ "v${version}" != "${RELEASE_TAG}" ]; then
  fail "module.json version ${version} does not match tag ${RELEASE_TAG}"
fi

# The zip is named after module.json's download URL, so the two cannot drift.
zip_name="$(basename "$download")"
rm -f "$zip_name"

contents=(module.json scripts lang templates)
for optional in LICENSE README.md CHANGELOG.md; do
  if [ -f "$optional" ]; then
    contents+=("$optional")
  fi
done

zip -r -X -q "$zip_name" "${contents[@]}" -x 'scripts/build.js' -x '*.DS_Store'

# Guard the exclusions: none of these may reach the installed module.
# The listing is captured first: grep -q on a pipe can end the writer with
# SIGPIPE, which pipefail reports as a failure.
listing="$(unzip -Z1 "$zip_name")"
if grep -E '^(bridge-server|tests|docs|prd|node_modules|coverage|\.github)/|\.test\.js$|^scripts/build\.js$|^\.env' <<<"$listing"; then
  fail "the zip contains files that must stay out (listed above)"
fi

grep -qx 'module.json' <<<"$listing" || fail "module.json is not at the zip root"

echo "package-module: built ${zip_name} (version ${version})"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "zip_name=${zip_name}" >> "$GITHUB_OUTPUT"
fi
