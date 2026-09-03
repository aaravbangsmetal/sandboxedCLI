import "server-only";

const DEFAULT_GITHUB_API_VERSION = "2022-11-28";

export const githubAuthConfig = {
  scope: process.env.GITHUB_OAUTH_SCOPE || "read:user user:email repo",
  apiVersion: process.env.GITHUB_API_VERSION || DEFAULT_GITHUB_API_VERSION,
} as const;
