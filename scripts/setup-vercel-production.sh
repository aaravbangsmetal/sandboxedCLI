#!/usr/bin/env bash
set -euo pipefail

# Configure production environment variables for the sandboxedcli Vercel project.
# Run after `vercel login`. Configure the project's Root Directory as apps/web.
#
# Required secrets (export before running, or pass inline):
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
#   SUPABASE_SERVICE_ROLE_KEY
#   GITHUB_TOKEN_ENCRYPTION_KEY
#   SANDBOX_SESSION_SECRET
#   SANDBOX_IMAGE (a ready custom agent image tag)
#
# Optional overrides:
#   NEXT_PUBLIC_SITE_URL (default: https://sandboxedcli.xyz)
#   VERCEL_SCOPE (team slug, e.g. surfersbot-first)

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/apps/web"

require() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: $name" >&2
    exit 1
  fi
}

require NEXT_PUBLIC_SUPABASE_URL
require NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
require SUPABASE_SERVICE_ROLE_KEY
require GITHUB_TOKEN_ENCRYPTION_KEY
require SANDBOX_SESSION_SECRET
require SANDBOX_IMAGE

SITE_URL="${NEXT_PUBLIC_SITE_URL:-https://sandboxedcli.xyz}"
SANDBOX_IMAGE_VALUE="$SANDBOX_IMAGE"
run_vercel() {
  if [[ -n "${VERCEL_SCOPE:-}" ]]; then
    vercel "$@" --scope "$VERCEL_SCOPE"
  else
    vercel "$@"
  fi
}

if [[ ! -f .vercel/project.json ]]; then
  run_vercel link --yes
fi

add_env() {
  local name="$1"
  local value="$2"
  printf '%s' "$value" | run_vercel env add "$name" production --force
}

echo "Setting production environment variables..."
add_env NEXT_PUBLIC_SITE_URL "$SITE_URL"
add_env NEXT_PUBLIC_SUPABASE_URL "$NEXT_PUBLIC_SUPABASE_URL"
add_env NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY "$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
add_env SUPABASE_SERVICE_ROLE_KEY "$SUPABASE_SERVICE_ROLE_KEY"
add_env GITHUB_TOKEN_ENCRYPTION_KEY "$GITHUB_TOKEN_ENCRYPTION_KEY"
add_env SANDBOX_SESSION_SECRET "$SANDBOX_SESSION_SECRET"
add_env GITHUB_OAUTH_SCOPE "read:user user:email repo"
add_env SANDBOX_IMAGE "$SANDBOX_IMAGE_VALUE"
add_env SANDBOX_SESSION_TIMEOUT_MS "900000"
add_env SANDBOX_LEASE_EXTENSION_MS "300000"
add_env SANDBOX_MAX_LIFETIME_MS "14400000"
add_env SANDBOX_VCPUS "2"
add_env SANDBOX_SNAPSHOT_EXPIRATION_MS "2592000000"
add_env SANDBOX_KEEP_SNAPSHOTS "1"

echo "Deploying to production..."
run_vercel deploy --prod --yes

echo "Done. Add $SITE_URL as a production domain in Vercel if it is not already assigned."
