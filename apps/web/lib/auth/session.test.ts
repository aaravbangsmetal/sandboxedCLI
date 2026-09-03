import { describe, expect, it } from "vitest";

import {
  createOAuthState,
  openGitHubSession,
  sealGitHubSession,
  verifyOAuthState,
  type GitHubSession,
} from "./session";

const session: GitHubSession = {
  accessToken: "gho_test-token",
  scope: "read:user user:email repo",
  tokenType: "bearer",
  user: {
    id: 123,
    login: "octocat",
    name: "The Octocat",
    avatarUrl: "https://github.com/images/error/octocat_happy.gif",
    htmlUrl: "https://github.com/octocat",
    email: "octocat@example.com",
  },
  createdAt: 1_000,
  expiresAt: 10_000,
};

describe("GitHub session sealing", () => {
  it("round-trips an encrypted session before expiry", () => {
    const sealed = sealGitHubSession(session);

    expect(sealed).not.toContain(session.accessToken);
    expect(openGitHubSession(sealed, 2_000)).toEqual(session);
  });

  it("rejects tampered or expired sessions", () => {
    const sealed = sealGitHubSession(session);
    const tampered = `${sealed.slice(0, -1)}x`;

    expect(openGitHubSession(tampered, 2_000)).toBeNull();
    expect(openGitHubSession(sealed, 10_000)).toBeNull();
  });

  it("creates verifiable OAuth state values", () => {
    const state = createOAuthState();

    expect(verifyOAuthState(state)).toBe(true);
    expect(verifyOAuthState(`${state.slice(0, -1)}x`)).toBe(false);
  });
});
