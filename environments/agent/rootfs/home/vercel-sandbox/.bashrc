if [ -f /etc/profile.d/sandboxed-cli.sh ]; then
  . /etc/profile.d/sandboxed-cli.sh
fi

if [ -t 1 ] && [ -z "${SANDBOXED_CLI_BANNER_SHOWN:-}" ]; then
  export SANDBOXED_CLI_BANNER_SHOWN=1
  printf '>_sandboxed/cli environment ready\n'
  printf '>_workspace %s\n' "${SANDBOXED_CLI_WORKSPACE:-/vercel/sandbox}"
fi
