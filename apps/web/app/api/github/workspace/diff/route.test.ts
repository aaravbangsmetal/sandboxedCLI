import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  requireGitHubSession: vi.fn(),
}));

const identity = vi.hoisted(() => ({
  getOrCreateWorkspaceIdentity: vi.fn(),
}));

const runtime = vi.hoisted(() => ({
  sandboxRuntime: {
    gitDiff: vi.fn(),
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

describe("GET /api/github/workspace/diff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requireGitHubSession.mockResolvedValue({ accessToken: "gho_token" });
    identity.getOrCreateWorkspaceIdentity.mockResolvedValue({ sandboxName: "sandboxed-cli-test" });
    runtime.getSandboxRuntime.mockReturnValue(runtime.sandboxRuntime);
    runtime.sandboxRuntime.gitDiff.mockResolvedValue({
      repositoryDirectory: "/vercel/sandbox/repos/octocat__hello-world",
      output: "+hello\n",
      truncated: false,
    });
  });

  it("returns a bounded diff for the active sandbox repository", async () => {
    const response = await GET();

    await expect(response.json()).resolves.toEqual({
      diff: {
        repositoryDirectory: "/vercel/sandbox/repos/octocat__hello-world",
        output: "+hello\n",
        truncated: false,
      },
    });
    expect(runtime.sandboxRuntime.gitDiff).toHaveBeenCalledWith("sandboxed-cli-test");
  });
});
