<div align="center">

# sandboxed/cli

### Your coding agents. A real cloud terminal. Any repository.

Run Codex, Claude Code, OpenCode, Git, and GitHub CLI from an isolated Vercel Sandbox—directly in the browser.

[Get started](#run-it-locally) · [How it works](#how-it-works) · [Production setup](docs/production-environment.md)

</div>

---

## What is sandboxed/cli?

sandboxed/cli turns a browser tab into a persistent cloud development machine. Sign in with GitHub, choose a repository, and work through a real interactive terminal without configuring a local environment.

The terminal is backed by a Vercel Sandbox rather than a simulated shell. Repositories, Git state, shell history, and agent configuration survive through filesystem snapshots, while authentication and repository access remain under the user's Supabase session.

## How it works

1. **Sign in with GitHub.** Supabase Auth handles the session and records the user's account and sign-in history.
2. **Choose a repository.** The server uses the granted GitHub access to clone or refresh it inside that user's sandbox.
3. **Open a terminal.** xterm.js connects to a real interactive shell through a short-lived Vercel controller credential.
4. **Build and ship.** Use Git, `gh`, Codex, Claude Code, or OpenCode; then review changes and open a pull request from the workspace.

```text
browser  →  Next.js control plane  →  Vercel Sandbox
   │                │                       │
   │                ├─ Supabase session     ├─ persistent workspace
   │                └─ GitHub access        └─ git + gh + agent CLIs
   └─ xterm.js ↔ interactive shell
```

## What is included

- A terminal-first onboarding and workspace interface
- Multiple independent terminals backed by stable `tmux` sessions
- Per-user sandbox creation, resume, lease extension, pause, and destruction
- Snapshot-backed repository and CLI configuration persistence
- GitHub repository discovery, clone, fetch, pull, push, diff, and pull-request delivery
- A reproducible agent image with Git, Git LFS, GitHub CLI, tmux, Node.js, pnpm, Python, Codex CLI, Claude Code, and OpenCode
- Server-only credential handling—the browser never receives the GitHub token, Supabase service key, or sandbox secrets

> Files persist across a sandbox stop; RAM and running processes do not. `tmux` preserves sessions through browser disconnects only while the VM remains running.

## Run it locally

Requirements: Node.js 22+, pnpm, a Supabase project, a GitHub OAuth App, and a Vercel project with Sandbox access.

```bash
git clone https://github.com/aaravbangsmetal/sandboxedCLI.git
cd sandboxedCLI
pnpm install

cd apps/web
vercel link
vercel env pull .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Copy any missing variables from [`apps/web/.env.example`](apps/web/.env.example), apply the migration in [`supabase/migrations`](supabase/migrations), and follow the complete [production environment guide](docs/production-environment.md) for OAuth and image setup.

## Sandbox image

The development environment is defined in [`environments/agent`](environments/agent). Build and publish it to Vercel Container Registry, then use the resulting ready tag as `SANDBOX_IMAGE`.

```bash
pnpm env:validate
VCR_REPOSITORY=sandboxed-cli-agent environments/agent/scripts/publish-vcr.sh
```

Agent logins are performed by each user inside their own sandbox and stored with that sandbox's persistent filesystem. The application does not require shared OpenAI, Anthropic, or OpenCode credentials.

## Security model

- Supabase owns the browser session; privileged database access stays server-side.
- GitHub provider tokens are encrypted before storage and decrypted only for server-side GitHub operations.
- Tokens are injected into sandbox commands through process environment, not command arguments or browser payloads.
- Sandbox identities are derived from verified users with a server secret; clients cannot choose arbitrary sandbox names.
- Mutating routes require an authenticated session, same-origin requests, and JSON payloads.
- Pull-request delivery happens on generated branches so changes remain reviewable before merge.

## Verify

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

Browser tests use a deterministic mock transport and do not consume Sandbox resources. The opt-in live test exercises the real create, stop, resume, snapshot, interactive-shell, and cleanup lifecycle:

```bash
RUN_VERCEL_SANDBOX_LIVE=1 pnpm --filter web test -- vercel-runtime.live.test.ts
```

---

<div align="center">

Built for developers who want cloud isolation without giving up their terminal workflow.

</div>
