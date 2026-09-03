import "server-only";

import { getGitHubSession } from "./session";

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("GitHub login is required.");
    this.name = "AuthenticationRequiredError";
  }
}

export async function requireGitHubSession() {
  const session = await getGitHubSession();
  if (!session) throw new AuthenticationRequiredError();
  return session;
}
