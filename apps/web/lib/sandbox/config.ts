import "server-only";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export const sandboxConfig = {
  image: process.env.SANDBOX_IMAGE || "sandboxed-cli-agent:dev",
  timeoutMs: boundedInteger(process.env.SANDBOX_SESSION_TIMEOUT_MS, 15 * MINUTE, MINUTE, DAY),
  vcpus: boundedInteger(process.env.SANDBOX_VCPUS, 2, 1, 32),
  snapshotExpirationMs: boundedInteger(
    process.env.SANDBOX_SNAPSHOT_EXPIRATION_MS,
    30 * DAY,
    DAY,
    365 * DAY,
  ),
  keepSnapshots: boundedInteger(process.env.SANDBOX_KEEP_SNAPSHOTS, 1, 1, 10),
  leaseExtensionMs: boundedInteger(
    process.env.SANDBOX_LEASE_EXTENSION_MS,
    5 * MINUTE,
    MINUTE,
    30 * MINUTE,
  ),
  cwd: "/vercel/sandbox",
  stateDirectory: "/vercel/sandbox/.sandboxedcli",
} as const;

export function hasVercelSandboxCredentials() {
  if (process.env.VERCEL_OIDC_TOKEN) return true;
  return Boolean(
    process.env.VERCEL_TOKEN && process.env.VERCEL_TEAM_ID && process.env.VERCEL_PROJECT_ID,
  );
}
