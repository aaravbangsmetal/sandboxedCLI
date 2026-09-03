#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../../.." && pwd)"
context_dir="${repo_root}/environments/agent"
manifest_path="${context_dir}/versions.json"
repository="${VCR_REPOSITORY:-sandboxed-cli-agent}"
tag="${SANDBOX_AGENT_TAG:-$(git -C "${repo_root}" rev-parse --short HEAD)}"
platform="${SANDBOX_AGENT_PLATFORM:-linux/amd64}"

if ! command -v docker >/dev/null 2>&1; then
  printf 'docker, podman, or buildah must be available to vercel vcr build docker\n' >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  printf 'jq is required to read %s\n' "${manifest_path}" >&2
  exit 1
fi

vercel_version="$(jq -r '.npmPackages.vercel.version' "${manifest_path}")"
image_ref="${repository}:${tag}"

if [ "${platform}" != "linux/amd64" ]; then
  printf 'Vercel Sandbox requires linux/amd64 custom images, got %s\n' "${platform}" >&2
  exit 1
fi

npx --yes "vercel@${vercel_version}" vcr build docker "${context_dir}" "${image_ref}" --push

printf 'published %s\n' "${image_ref}"
printf 'set SANDBOX_IMAGE=%s after VCR shows the tag as Ready\n' "${image_ref}"
