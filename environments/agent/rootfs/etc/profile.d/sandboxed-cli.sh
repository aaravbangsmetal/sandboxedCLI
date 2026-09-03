# Managed by sandboxed/cli.
export SANDBOXED_CLI=1
export SANDBOXED_CLI_WORKSPACE=/vercel/sandbox
export SANDBOXED_CLI_STATE=/vercel/sandbox/.sandboxedcli
export SANDBOXED_CLI_TMP=/tmp/sandboxed-cli
export HISTFILE="${SANDBOXED_CLI_STATE}/history/bash_history"
export HISTSIZE=10000
export HISTFILESIZE=20000
export NPM_CONFIG_CACHE="${SANDBOXED_CLI_STATE}/cache/npm"
export PNPM_HOME="${SANDBOXED_CLI_STATE}/pnpm"
export CODEX_HOME="${SANDBOXED_CLI_STATE}/agents/codex"
export CLAUDE_CONFIG_DIR="${SANDBOXED_CLI_STATE}/agents/claude"
export XDG_CONFIG_HOME="${SANDBOXED_CLI_STATE}/agents/xdg-config"
export XDG_DATA_HOME="${SANDBOXED_CLI_STATE}/agents/xdg-data"
export EDITOR=vim
export PAGER=less

case ":${PATH}:" in
  *":${PNPM_HOME}:"*) ;;
  *) export PATH="${PNPM_HOME}:${PATH}" ;;
esac

mkdir -p \
  "${SANDBOXED_CLI_STATE}/cache/npm" \
  "${CODEX_HOME}" \
  "${CLAUDE_CONFIG_DIR}" \
  "${SANDBOXED_CLI_STATE}/history" \
  "${SANDBOXED_CLI_STATE}/logs" \
  "${XDG_CONFIG_HOME}" \
  "${XDG_DATA_HOME}" \
  "${SANDBOXED_CLI_TMP}" \
  2>/dev/null || true

if [ -n "${BASH_VERSION:-}" ]; then
  shopt -s histappend 2>/dev/null || true
  if [ -n "${PROMPT_COMMAND:-}" ]; then
    PROMPT_COMMAND="history -a; history -n; ${PROMPT_COMMAND}"
  else
    PROMPT_COMMAND="history -a; history -n"
  fi
  PS1='>_ '
fi

cd "${SANDBOXED_CLI_WORKSPACE}" 2>/dev/null || true
