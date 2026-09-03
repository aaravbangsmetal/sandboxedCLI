#!/usr/bin/env bash
set -euo pipefail

manifest_path="/opt/sandboxed-cli/versions.json"
workspace_path="${SANDBOXED_CLI_WORKSPACE:-/vercel/sandbox}"
state_path="${SANDBOXED_CLI_STATE:-/vercel/sandbox/.sandboxedcli}"
format="${1:-text}"
checks_json="[]"
failed=0

append_check() {
  local name="$1"
  local status="$2"
  local detail="$3"

  checks_json="$(
    jq \
      --arg name "$name" \
      --arg status "$status" \
      --arg detail "$detail" \
      '. + [{ name: $name, status: $status, detail: $detail }]' \
      <<<"${checks_json}"
  )"

  if [ "${status}" = "fail" ]; then
    failed=1
  fi
}

require_command() {
  local command_name="$1"

  if command -v "${command_name}" >/dev/null 2>&1; then
    append_check "command:${command_name}" "ok" "$(command -v "${command_name}")"
  else
    append_check "command:${command_name}" "fail" "missing"
  fi
}

version_field() {
  jq -r "$1" "${manifest_path}"
}

check_contains_version() {
  local name="$1"
  local expected="$2"
  local actual="$3"

  if [[ "${actual}" == *"${expected}"* ]]; then
    append_check "version:${name}" "ok" "${actual}"
  else
    append_check "version:${name}" "fail" "expected ${expected}, got ${actual}"
  fi
}

check_writable_directory() {
  local label="$1"
  local path="$2"
  local probe="${path}/.sandboxed-health"

  if mkdir -p "${path}" >/dev/null 2>&1 && touch "${probe}" >/dev/null 2>&1; then
    rm -f "${probe}"
    append_check "writable:${label}" "ok" "${path}"
  else
    append_check "writable:${label}" "fail" "${path}"
  fi
}

if [ ! -f "${manifest_path}" ]; then
  append_check "manifest" "fail" "${manifest_path} missing"
else
  append_check "manifest" "ok" "${manifest_path}"
fi

for command_name in bash curl fd gh git jq node npm opencode pnpm python rg tmux unzip; do
  require_command "${command_name}"
done

if [ -f "${manifest_path}" ]; then
  check_contains_version "node" "$(version_field '.node.version')" "$(node --version)"
  check_contains_version "pnpm" "$(version_field '.npmPackages.pnpm.version')" "$(pnpm --version)"
  check_contains_version "github-cli" "$(version_field '.githubCli.version')" "$(gh --version | awk 'NR == 1 { print $3 }')"
  check_contains_version "codex" "$(version_field '.npmPackages["@openai/codex"].version')" "$(codex --version | head -n 1)"
  check_contains_version "claude-code" "$(version_field '.npmPackages["@anthropic-ai/claude-code"].version')" "$(claude --version | head -n 1)"
  check_contains_version "opencode" "$(version_field '.npmPackages["opencode-ai"].version')" "$(opencode --version | head -n 1)"
fi

check_writable_directory "workspace" "${workspace_path}"
check_writable_directory "state" "${state_path}"
check_writable_directory "history" "${state_path}/history"
check_writable_directory "npm-cache" "${state_path}/cache/npm"

overall="ok"
if [ "${failed}" -ne 0 ]; then
  overall="fail"
fi

if [ "${format}" = "--json" ]; then
  jq -n \
    --arg status "${overall}" \
    --arg workspace "${workspace_path}" \
    --arg state "${state_path}" \
    --argjson checks "${checks_json}" \
    --slurpfile manifest "${manifest_path}" \
    '{
      status: $status,
      workspace: $workspace,
      stateDirectory: $state,
      manifest: $manifest[0],
      checks: $checks
    }'
else
  jq -r '.[] | "\(.status)\t\(.name)\t\(.detail)"' <<<"${checks_json}"
  printf 'status\t%s\n' "${overall}"
fi

if [ "${failed}" -ne 0 ]; then
  exit 1
fi
