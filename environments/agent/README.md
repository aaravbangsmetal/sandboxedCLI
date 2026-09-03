# sandboxed/cli agent environment

This image is the reproducible Vercel Sandbox runtime for the `envs` branch. It is built for `linux/amd64`, because Vercel Sandbox custom images run on that platform.

## Included tools

- Ubuntu 24.04 pinned by digest and frozen to the `20260831T000000Z` package snapshot.
- Core shell and development tools: `bash`, `build-essential`, `curl`, `fd`, `git`, `git-lfs`, `gh`, `jq`, `python`, `rg`, `sqlite3`, `tmux`, `tree`, `unzip`, `vim`, `zip`.
- Node.js `24.20.0` with a checksum-verified upstream tarball.
- Global npm CLIs pinned in `versions.json`: `pnpm`, `@openai/codex`, `@anthropic-ai/claude-code`, `opencode-ai`, and the Vercel CLI used for publishing.
- `sandboxed-env` for a concise version/path summary.
- `sandboxed-health --json` for app-level environment verification.

## Persistence model

The working directory is `/vercel/sandbox`. The image creates `/vercel/sandbox/.sandboxedcli` for state that should survive Vercel Sandbox filesystem snapshots:

- `history/bash_history`
- `cache/npm`
- `logs`
- `pnpm`

Running processes and RAM still disappear when the VM stops. `tmux` preserves interactive sessions only while the VM is running; durable process replay belongs in the later backend/event layer.

## Local validation

```bash
pnpm env:validate
pnpm env:verify
```

`env:validate` is offline and checks that the manifest, Dockerfile ARGs, and script modes match. `env:verify` builds the image and runs `sandboxed-health --json` inside it when Docker is installed. Set `REQUIRE_DOCKER=1` in CI to fail instead of skipping when Docker is missing.

## Build and publish

```bash
SANDBOX_AGENT_IMAGE=sandboxed-cli-agent:dev environments/agent/scripts/build-image.sh --load
VCR_REPOSITORY=sandboxed-cli-agent environments/agent/scripts/publish-vcr.sh
```

The publish script uses the pinned Vercel CLI and runs:

```bash
vercel vcr build docker environments/agent sandboxed-cli-agent:<git-sha> --push
```

After Vercel Container Registry shows the tag as ready, set:

```bash
SANDBOX_IMAGE=sandboxed-cli-agent:<git-sha>
```

Do not put provider API keys into the image. User and product credentials remain runtime concerns for the backend phase.
