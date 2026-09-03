# Production environment

## Required Vercel variables

| Variable | Value | Source |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` | Supabase Dashboard → Project Settings → API, or the project Connect dialog |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` | Supabase Dashboard → Project Settings → API, or the project Connect dialog |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret service-role key | Supabase Dashboard → Project Settings → API → Legacy API Keys; server only |
| `GITHUB_TOKEN_ENCRYPTION_KEY` | Random 32-byte-or-longer secret | Generate once with `openssl rand -base64 32` |
| `SANDBOX_SESSION_SECRET` | A different random 32-byte-or-longer secret | Generate once with `openssl rand -base64 32` |
| `SANDBOX_IMAGE` | Ready Vercel Container Registry tag | Output of `environments/agent/scripts/publish-vcr.sh` after the image build is ready |

Do not expose `SUPABASE_SERVICE_ROLE_KEY`, `GITHUB_TOKEN_ENCRYPTION_KEY`, or `SANDBOX_SESSION_SECRET` with a `NEXT_PUBLIC_` prefix.

Vercel automatically supplies `VERCEL_OIDC_TOKEN` to deployments. Do not manually copy it into production. `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, and `VERCEL_PROJECT_ID` are only needed for local development or a non-Vercel host.

## Recommended explicit values

```dotenv
GITHUB_OAUTH_SCOPE=read:user user:email repo
SANDBOX_SESSION_TIMEOUT_MS=900000
SANDBOX_LEASE_EXTENSION_MS=300000
SANDBOX_VCPUS=2
SANDBOX_SNAPSHOT_EXPIRATION_MS=2592000000
SANDBOX_KEEP_SNAPSHOTS=1
```

Leave `NEXT_PUBLIC_SANDBOX_TRANSPORT` unset in production. The value `mock` disables the real Vercel terminal and is intended only for browser tests.

## GitHub and Supabase dashboard configuration

1. Create a GitHub OAuth App under GitHub Settings → Developer settings → OAuth Apps.
2. In the Supabase Dashboard, open Authentication → Providers → GitHub and copy the displayed Supabase callback URL.
3. Use that Supabase URL as the GitHub OAuth App authorization callback URL. It normally looks like `https://<project-ref>.supabase.co/auth/v1/callback`.
4. Copy the GitHub Client ID and Client Secret into the Supabase GitHub provider settings. They do not belong in Vercel environment variables.
5. In Supabase Authentication → URL Configuration, set the production Site URL and add `https://<production-domain>/api/auth/github/callback` to Redirect URLs. Add `http://localhost:3000/api/auth/github/callback` for local development.
6. Apply every SQL file in `supabase/migrations/` to the production project before deploying.

## Custom sandbox image

The custom image contains Git, Git LFS, GitHub CLI, tmux, Node.js, pnpm, Python, Codex CLI, Claude Code, and OpenCode. Publish the image after merging changes that touch `environments/agent/`:

```bash
VCR_REPOSITORY=sandboxed-cli-agent environments/agent/scripts/publish-vcr.sh
```

Copy the ready image tag printed by the script into `SANDBOX_IMAGE`. Agent login data is stored under `/vercel/sandbox/.sandboxedcli/agents`, which is part of the persistent sandbox snapshot.

## Live verification

After variables, provider settings, migrations, and the image are configured:

1. Sign in through the existing terminal-styled `/auth` page.
2. Confirm the user and `last_sign_in_at` appear in Supabase Authentication → Users.
3. Clone a private test repository.
4. In the opened terminal, run `pwd`, `gh auth status`, `git fetch`, and `git push` on a temporary branch.
5. Stop and resume the sandbox, then confirm repository files and agent login state remain available.
6. Use the delivery panel to review a diff and open a test pull request.
