# sandboxed/cli

A browser terminal backed by a real [Vercel Sandbox](https://vercel.com/docs/sandbox). Supabase Auth owns persistent GitHub login and user history, while the backend uses the granted GitHub access to clone repositories, review changes, push branches, and create pull requests from the sandbox.

## What is real

- GitHub OAuth runs through Supabase Auth using its cookie-based PKCE session; browser code never receives the GitHub access token.
- Supabase records each user, account creation time, and last sign-in time in `auth.users`.
- Because Supabase intentionally does not retain provider tokens, the callback encrypts the GitHub token and stores it in a service-role-only `github_connections` row keyed by the Supabase user ID.
- Authenticated users can list repositories available to the granted OAuth scope across multiple GitHub API pages.
- Selected repositories are cloned inside the persistent sandbox with a transient GitHub token passed only to the server-side sandbox command environment.
- A stable named persistent sandbox is derived from the verified Supabase user, so a returning user reaches the same VM filesystem across browser sessions and devices.
- xterm connects directly to Vercel's interactive shell controller with a just-in-time WebSocket token.
- Each browser tab maps to a stable `tmux` session while the VM is running.
- Terminal tmux sessions receive GitHub credentials server-side. `git fetch`, `git pull`, `git push`, and `gh` work without exposing the token in the browser connection payload or writing it to snapshots.
- Selecting a repository fetches an existing clone when present, marks it active, and opens a fresh terminal rooted in that repository.
- Codex, Claude Code, and OpenCode keep their on-disk authentication/configuration under the snapshotted workspace state directory.
- Tab identities survive reloads in local storage and reconnect to their `tmux` sessions.
- The UI can query status, extend the active lease, pause/snapshot, resume, terminate one terminal, or permanently destroy the sandbox and its orphan snapshots.
- The delivery panel reads git status/diff, commits changed files on a generated sandbox branch, pushes it to GitHub, and opens a pull request against the cloned repository's default branch.
- Leaving the page closes browser sockets. The VM remains available until its timeout, then Vercel snapshots the persistent filesystem. Logout requests an immediate pause first.

## Persistence contract

| Event | Files | Shell processes / RAM | Browser transcript |
| --- | --- | --- | --- |
| Switch terminal tabs | Preserved | Preserved | Redrawn by xterm/tmux |
| Reload or temporary disconnect | Preserved | Preserved while VM is running | tmux redraws current terminal state |
| Leave until session timeout | Snapshotted | Lost when the VM stops | Command history is stored on disk |
| Click pause | Snapshotted | Lost | Restored shell starts from saved files/history |
| Click destroy | Permanently deleted | Terminated | Local tab metadata is cleared |

Vercel Sandbox persistence is filesystem snapshot persistence, not machine-memory persistence. A stopped VM cannot resume a running Codex/Claude process in memory. The `tmux` layer handles network disconnects only while the VM remains running. Exact output replay across a VM stop still requires a durable event/broker service beyond this branch.

## Local setup

```bash
pnpm install
cd apps/web
vercel link
vercel env pull .env.local
openssl rand -base64 32 # place the result in SANDBOX_SESSION_SECRET
openssl rand -base64 32 # place the result in GITHUB_TOKEN_ENCRYPTION_KEY
pnpm dev
```

Vercel deployments receive `VERCEL_OIDC_TOKEN` automatically. Outside that environment, configure either the OIDC token or all of `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, and `VERCEL_PROJECT_ID`. See [`apps/web/.env.example`](apps/web/.env.example).

Create a Supabase project, copy its project URL, publishable key, and service-role key into the server environment, then apply [`supabase/migrations/0001_github_connections.sql`](supabase/migrations/0001_github_connections.sql). In Supabase Authentication:

1. Enable the GitHub provider and put the GitHub OAuth App client ID and secret there, not in this application's environment.
2. Set the GitHub OAuth App callback to the Supabase callback shown by the provider panel, normally `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Add `http://localhost:3000/api/auth/github/callback` and the production equivalent to Supabase's redirect allow list.
4. Set the Supabase Site URL to the production application origin.

The app's `/auth` screen redirects into this flow directly; it does not render a Supabase-hosted login page. The current default GitHub scope is `read:user user:email repo`, allowing private repository clone and push after the user grants access. A normal returning browser session refreshes through Supabase and reuses the encrypted connection. Explicit logout ends the current Supabase session but retains the connection record; the next explicit login refreshes that record with the newest provider token.

The default image on `envs` is `sandboxed-cli-agent:dev`. Build it from [`environments/agent/Dockerfile`](environments/agent/Dockerfile), publish it to Vercel Container Registry, then set `SANDBOX_IMAGE` to the ready repository tag printed by [`environments/agent/scripts/publish-vcr.sh`](environments/agent/scripts/publish-vcr.sh). See [`environments/agent/README.md`](environments/agent/README.md) for the full environment contract.

## Lifecycle API

All sandbox routes require a verified Supabase/GitHub session, and mutation routes additionally require same-origin `application/json` requests. The browser never supplies a sandbox name; the server derives one from the Supabase user ID with an HMAC secret.

- `GET /api/sandbox` — status only; never wakes a stopped sandbox.
- `POST /api/sandbox` — create or resume.
- `POST /api/sandbox/terminal` — issue a fresh interactive-shell connection.
- `DELETE /api/sandbox/terminal` — terminate one `tmux` session without waking a stopped VM.
- `POST /api/sandbox/extend` — extend the running session by the server-configured lease.
- `POST /api/sandbox/pause` — stop and snapshot.
- `DELETE /api/sandbox` with `{ "confirm": "destroy" }` — permanently delete the sandbox and orphan snapshots.

Interactive controller tokens are returned with `Cache-Control: no-store`, used in memory, and never persisted or logged. Provider credentials remain server-only.

The GitHub provider token is injected only into the server-created tmux process environment. The browser receives an attach-only tmux command, so the terminal can use Git and GitHub CLI without placing the token in the WebSocket startup frame or sandbox filesystem.

## GitHub API

All authenticated GitHub routes require a verified Supabase user plus that user's encrypted GitHub connection. All mutating routes also require same-origin `application/json` requests.

- `GET /api/auth/session` — return session presence, account timestamps, and the GitHub viewer profile, without the access token.
- `DELETE /api/auth/session` — sign out the current Supabase session without deleting the durable encrypted provider connection.
- `GET /api/github/repos` — list repositories visible to the OAuth token.
- `POST /api/github/repos/clone` with `{ "fullName": "owner/repo" }` — clone the selected repository into the persistent sandbox and mark it active.
- `GET /api/github/workspace` — read `git status --short --branch` for the active sandbox repository.
- `GET /api/github/workspace/diff` — read a bounded text diff for review.
- `POST /api/github/workspace/pr` with `{ "title": "...", "body": "..." }` — commit active changes, push a sandbox branch, and open a pull request.

Supabase stores refreshable auth state in secure cookies. The server decrypts the provider token only when a GitHub operation needs it, and passes it into sandbox git commands through process environment rather than shell arguments. The service-role key and provider token are never returned to browser code.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

The normal Playwright run uses the mock browser transport so it is deterministic and cannot spend Sandbox resources. To verify the actual Vercel stop/resume persistence cycle with configured credentials:

```bash
RUN_VERCEL_SANDBOX_LIVE=1 pnpm --filter web test -- vercel-runtime.live.test.ts
```

The live test creates a uniquely named sandbox, writes a marker, stops and resumes it, verifies the marker, requests an interactive credential, and deletes the sandbox plus orphan snapshots in `finally`.
