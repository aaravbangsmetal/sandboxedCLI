#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../../.." && pwd)"
context_dir="${repo_root}/environments/agent"
image_ref="${SANDBOX_AGENT_IMAGE:-sandboxed-cli-agent:dev}"
platform="${SANDBOX_AGENT_PLATFORM:-linux/amd64}"

if ! command -v docker >/dev/null 2>&1; then
  printf 'docker is required to build %s\n' "${image_ref}" >&2
  exit 1
fi

docker buildx build \
  --platform "${platform}" \
  --tag "${image_ref}" \
  --file "${context_dir}/Dockerfile" \
  "${context_dir}" \
  "$@"
