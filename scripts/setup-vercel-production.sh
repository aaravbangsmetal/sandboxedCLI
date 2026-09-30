#!/usr/bin/env bash
set -euo pipefail

# Configure production environment variables for the sandboxedcli Vercel project.
# Run after `vercel login` and `vercel link` from the repository root.
#
# Required secrets (export before running, or pass inline):
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
#   SUPABASE_SERVICE_ROLE_KEY
#   GITHUB_TOKEN_ENCRYPTION_KEY
#   SANDBOX_SESSION_SECRET
#
# Optional overrides:
#   NEXT_PUBLIC_SITE_URL (default: https://sandboxedcli.xyz)
#   SANDBOX_IMAGE (default: vercel/sandbox/universal:latest)
#   VERCEL_SCOPE (team slug, e.g. surfersbot-first)

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

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

SITE_URL="${NEXT_PUBLIC_SITE_URL:-https://sandboxedcli.xyz}"
SANDBOX_IMAGE_VALUE="${SANDBOX_IMAGE:-vercel/sandbox/universal:latest}"
SCOPE_ARGS=()
if [[ -n "${VERCEL_SCOPE:-}" ]]; then
  SCOPE_ARGS=(--scope "$VERCEL_SCOPE")
fi

add_env() {
  local name="$1"
  local value="$2"
  printf '%s' "$value" | vercel env add "$name" production "${SCOPE_ARGS[@]}" --force
  printf '%s' "$value" | vercel env add "$name" preview "${SCOPE_ARGS[@]}" --force
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

echo "Linking project (monorepo root) if needed..."
if [[ ! -f .vercel/project.json ]]; then
  vercel link --yes "${SCOPE_ARGS[@]}"
fi

echo "Deploying to production..."
vercel deploy --prod --yes "${SCOPE_ARGS[@]}"

echo "Done. Add $SITE_URL as a production domain in Vercel if it is not already assigned."
