#!/usr/bin/env bash
set -euo pipefail

manifest_path="/opt/sandboxed-cli/versions.json"

printf '>_sandboxed/cli environment\n'
printf 'workspace: %s\n' "${SANDBOXED_CLI_WORKSPACE:-/vercel/sandbox}"
printf 'state:     %s\n' "${SANDBOXED_CLI_STATE:-/vercel/sandbox/.sandboxedcli}"
printf '\n'

if [ -f "${manifest_path}" ]; then
  jq -r '
    "base:      \(.baseImage)",
    "node:      \(.node.version)",
    "pnpm:      \(.npmPackages.pnpm.version)",
    "gh:        \(.githubCli.version)",
    "codex:     \(.npmPackages["@openai/codex"].version)",
    "claude:    \(.npmPackages["@anthropic-ai/claude-code"].version)",
    "opencode:  \(.npmPackages["opencode-ai"].version)"
  ' "${manifest_path}"
else
  printf 'manifest:  missing\n'
fi

printf '\n'
printf 'Run sandboxed-health for a full health report.\n'
