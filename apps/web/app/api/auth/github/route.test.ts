import { describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({
  assertGitHubOAuthConfigured: vi.fn(),
}));

const session = vi.hoisted(() => ({
  createOAuthState: vi.fn(() => "state-token"),
  setOAuthStateCookie: vi.fn(),
}));

const github = vi.hoisted(() => ({
  githubAuthorizeUrl: vi.fn((state: string) => `https://github.com/login/oauth/authorize?state=${state}`),
}));

vi.mock("@/lib/auth/config", () => config);
vi.mock("@/lib/auth/session", () => session);
vi.mock("@/lib/github/client", () => github);

import { GET } from "./route";

describe("GET /api/auth/github", () => {
  it("sets an OAuth state cookie and redirects to GitHub", async () => {
    const response = await GET();

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://github.com/login/oauth/authorize?state=state-token",
    );
    expect(session.setOAuthStateCookie).toHaveBeenCalledWith("state-token");
  });
});
