import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  requireGitHubSession: vi.fn(),
}));

const github = vi.hoisted(() => ({
  listGitHubRepositories: vi.fn(),
}));

vi.mock("@/lib/auth/require-session", () => ({
  AuthenticationRequiredError: class AuthenticationRequiredError extends Error {},
  requireGitHubSession: auth.requireGitHubSession,
}));
vi.mock("@/lib/github/client", () => github);

import { GET } from "./route";

describe("GET /api/github/repos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requireGitHubSession.mockResolvedValue({ accessToken: "gho_token" });
    github.listGitHubRepositories.mockResolvedValue([
      {
        id: 1,
        fullName: "octocat/hello-world",
        permissions: { pull: true, push: true },
      },
    ]);
  });

  it("lists repositories with the sealed server-side access token", async () => {
    const response = await GET();

    await expect(response.json()).resolves.toEqual({
      repositories: [
        {
          id: 1,
          fullName: "octocat/hello-world",
          permissions: { pull: true, push: true },
        },
      ],
    });
    expect(github.listGitHubRepositories).toHaveBeenCalledWith("gho_token");
  });
});
