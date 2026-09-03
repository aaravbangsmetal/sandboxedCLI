#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../../.." && pwd)"
image_ref="${SANDBOX_AGENT_TEST_IMAGE:-sandboxed-cli-agent:test}"

if ! command -v docker >/dev/null 2>&1; then
  if [ "${REQUIRE_DOCKER:-0}" = "1" ]; then
    printf 'docker is required for image verification\n' >&2
    exit 1
  fi
  printf 'skipped image verification: docker is not installed\n'
  exit 0
fi

SANDBOX_AGENT_IMAGE="${image_ref}" "${repo_root}/environments/agent/scripts/build-image.sh" --load

docker run --rm \
  --platform "${SANDBOX_AGENT_PLATFORM:-linux/amd64}" \
  --entrypoint /usr/local/bin/sandboxed-health \
  "${image_ref}" \
  --json
