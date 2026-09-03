# sandboxed/cli

A browser terminal backed by a real [Vercel Sandbox](https://vercel.com/docs/sandbox). This branch implements the sandbox control and data planes; GitHub authentication and repository credentials remain intentionally out of scope until the `backend` phase.

## What is real on `sandbox`

- A named persistent sandbox is created or resumed for each signed anonymous workspace.
- xterm connects directly to Vercel's interactive shell controller with a just-in-time WebSocket token.
- Each browser tab maps to a stable `tmux` session while the VM is running.
- Tab identities survive reloads in local storage and reconnect to their `tmux` sessions.
- The UI can query status, extend the active lease, pause/snapshot, resume, terminate one terminal, or permanently destroy the sandbox and its orphan snapshots.
- Leaving the page closes browser sockets. The VM remains available until its timeout, then Vercel snapshots the persistent filesystem. Logout requests an immediate pause first.

## Persistence contract

| Event | Files | Shell processes / RAM | Browser transcript |
| --- | --- | --- | --- |
| Switch terminal tabs | Preserved | Preserved | Redrawn by xterm/tmux |
| Reload or temporary disconnect | Preserved | Preserved while VM is running | tmux redraws current terminal state |
| Leave until session timeout | Snapshotted | Lost when the VM stops | Command history is stored on disk |
| Click pause | Snapshotted | Lost | Restored shell starts from saved files/history |
| Click destroy | Permanently deleted | Terminated | Local tab metadata is cleared |

Vercel Sandbox persistence is filesystem snapshot persistence, not machine-memory persistence. A stopped VM cannot resume a running Codex/Claude process in memory. The `tmux` layer handles network disconnects only while the VM remains running. Exact output replay across a VM stop would require a durable event/broker service planned for the backend phase.

## Local setup

```bash
pnpm install
cd apps/web
vercel link
vercel env pull .env.local
openssl rand -base64 32 # place the result in SANDBOX_SESSION_SECRET
pnpm dev
```

Vercel deployments receive `VERCEL_OIDC_TOKEN` automatically. Outside that environment, configure either the OIDC token or all of `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, and `VERCEL_PROJECT_ID`. See [`apps/web/.env.example`](apps/web/.env.example).

The default image on `envs` is `sandboxed-cli-agent:dev`. Build it from [`environments/agent/Dockerfile`](environments/agent/Dockerfile), publish it to Vercel Container Registry, then set `SANDBOX_IMAGE` to the ready repository tag printed by [`environments/agent/scripts/publish-vcr.sh`](environments/agent/scripts/publish-vcr.sh). See [`environments/agent/README.md`](environments/agent/README.md) for the full environment contract.

## Lifecycle API

All mutation routes require same-origin `application/json` requests. The browser never supplies a sandbox name; the server derives one from an HMAC-signed HttpOnly workspace cookie.

- `GET /api/sandbox` — status only; never wakes a stopped sandbox.
- `POST /api/sandbox` — create or resume.
- `POST /api/sandbox/terminal` — issue a fresh interactive-shell connection.
- `DELETE /api/sandbox/terminal` — terminate one `tmux` session without waking a stopped VM.
- `POST /api/sandbox/extend` — extend the running session by the server-configured lease.
- `POST /api/sandbox/pause` — stop and snapshot.
- `DELETE /api/sandbox` with `{ "confirm": "destroy" }` — permanently delete the sandbox and orphan snapshots.

Interactive controller tokens are returned with `Cache-Control: no-store`, used in memory, and never persisted or logged. Provider credentials remain server-only.

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
