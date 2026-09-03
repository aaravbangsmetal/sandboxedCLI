import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  requireGitHubSession: vi.fn(),
}));

const identity = vi.hoisted(() => ({
  getOrCreateWorkspaceIdentity: vi.fn(),
}));

const runtime = vi.hoisted(() => ({
  sandboxRuntime: {
    gitStatus: vi.fn(),
  },
  getSandboxRuntime: vi.fn(),
}));

vi.mock("@/lib/auth/require-session", () => ({
  AuthenticationRequiredError: class AuthenticationRequiredError extends Error {},
  requireGitHubSession: auth.requireGitHubSession,
}));
vi.mock("@/lib/sandbox/identity", () => identity);
vi.mock("@/lib/sandbox/runtime", () => ({
  getSandboxRuntime: runtime.getSandboxRuntime,
}));

import { GET } from "./route";

describe("GET /api/github/workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requireGitHubSession.mockResolvedValue({ accessToken: "gho_token" });
    identity.getOrCreateWorkspaceIdentity.mockResolvedValue({ sandboxName: "sandboxed-cli-test" });
    runtime.getSandboxRuntime.mockReturnValue(runtime.sandboxRuntime);
    runtime.sandboxRuntime.gitStatus.mockResolvedValue({
      repositoryDirectory: "/vercel/sandbox/repos/octocat__hello-world",
      output: "## main...origin/main\n M README.md\n",
    });
  });

  it("returns git status for the active sandbox repository", async () => {
    const response = await GET();

    await expect(response.json()).resolves.toEqual({
      status: {
        repositoryDirectory: "/vercel/sandbox/repos/octocat__hello-world",
        output: "## main...origin/main\n M README.md\n",
      },
    });
    expect(runtime.sandboxRuntime.gitStatus).toHaveBeenCalledWith("sandboxed-cli-test");
  });
});
