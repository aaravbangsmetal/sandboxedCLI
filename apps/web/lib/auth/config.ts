import "server-only";

const DEFAULT_GITHUB_API_VERSION = "2022-11-28";

function requiredSecret(name: string, fallback?: string) {
  const value = process.env[name] || fallback;
  if (value) return value;
  if (process.env.NODE_ENV !== "production") return `${name.toLowerCase()}-local-development-only`;
  throw new Error(`${name} is required in production.`);
}

export const githubAuthConfig = {
  clientId: process.env.GITHUB_CLIENT_ID || "",
  clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
  callbackUrl: process.env.GITHUB_CALLBACK_URL || "",
  scope: process.env.GITHUB_OAUTH_SCOPE || "read:user user:email repo",
  apiVersion: process.env.GITHUB_API_VERSION || DEFAULT_GITHUB_API_VERSION,
  sessionCookieName: "sandboxedcli_github_session",
  stateCookieName: "sandboxedcli_github_oauth_state",
  sessionMaxAgeSeconds: 8 * 60 * 60,
} as const;

export function githubSessionSecret() {
  return requiredSecret("GITHUB_SESSION_SECRET", process.env.SANDBOX_SESSION_SECRET);
}

export function assertGitHubOAuthConfigured() {
  if (!githubAuthConfig.clientId || !githubAuthConfig.clientSecret) {
    throw new Error("GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.");
  }
}
