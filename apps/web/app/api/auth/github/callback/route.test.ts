import { beforeEach, describe, expect, it, vi } from "vitest";

const authSession = vi.hoisted(() => ({
  consumeOAuthStateCookie: vi.fn(),
  setGitHubSession: vi.fn(),
  verifyOAuthState: vi.fn(),
}));

const github = vi.hoisted(() => ({
  exchangeGitHubCode: vi.fn(),
  fetchGitHubViewer: vi.fn(),
}));

vi.mock("@/lib/auth/config", () => ({
  githubAuthConfig: { sessionMaxAgeSeconds: 60 },
}));
vi.mock("@/lib/auth/session", () => authSession);
vi.mock("@/lib/github/client", () => github);

import { GET } from "./route";

describe("GET /api/auth/github/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authSession.consumeOAuthStateCookie.mockResolvedValue("state-token");
    authSession.verifyOAuthState.mockReturnValue(true);
    github.exchangeGitHubCode.mockResolvedValue({
      accessToken: "gho_token",
      scope: "repo",
      tokenType: "bearer",
    });
    github.fetchGitHubViewer.mockResolvedValue({
      id: 1,
      login: "octocat",
      name: null,
      avatarUrl: "https://avatars.githubusercontent.com/u/1",
      htmlUrl: "https://github.com/octocat",
      email: "octocat@example.com",
    });
  });

  it("creates a sealed session and redirects into setup", async () => {
    const response = await GET(
      new Request("https://sandboxedcli.xyz/api/auth/github/callback?code=abc&state=state-token"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://sandboxedcli.xyz/setup");
    expect(authSession.setGitHubSession).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "gho_token",
        user: expect.objectContaining({ login: "octocat", email: "octocat@example.com" }),
      }),
    );
  });

  it("rejects missing or mismatched OAuth state", async () => {
    authSession.consumeOAuthStateCookie.mockResolvedValue("different-state");

    const response = await GET(
      new Request("https://sandboxedcli.xyz/api/auth/github/callback?code=abc&state=state-token"),
    );

    expect(response.headers.get("location")).toBe(
      "https://sandboxedcli.xyz/auth?error=github_state_invalid",
    );
    expect(authSession.setGitHubSession).not.toHaveBeenCalled();
  });
});
