import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  requireGitHubSession: vi.fn(),
}));

const github = vi.hoisted(() => ({
  createGitHubPullRequest: vi.fn(),
}));

const identity = vi.hoisted(() => ({
  getOrCreateWorkspaceIdentity: vi.fn(),
}));

const lock = vi.hoisted(() => ({
  withSandboxMutationLock: vi.fn(),
}));

const runtime = vi.hoisted(() => ({
  sandboxRuntime: {
    commitAndPushActiveRepository: vi.fn(),
  },
  getSandboxRuntime: vi.fn(),
}));

vi.mock("@/lib/auth/require-session", () => ({
  AuthenticationRequiredError: class AuthenticationRequiredError extends Error {},
  requireGitHubSession: auth.requireGitHubSession,
}));
vi.mock("@/lib/github/client", () => github);
vi.mock("@/lib/sandbox/identity", () => identity);
vi.mock("@/lib/sandbox/mutation-lock", () => lock);
vi.mock("@/lib/sandbox/runtime", () => ({
  getSandboxRuntime: runtime.getSandboxRuntime,
}));

import { POST } from "./route";

function prRequest(body: unknown) {
  return new Request("https://sandboxedcli.xyz/api/github/workspace/pr", {
    method: "POST",
    headers: {
      host: "sandboxedcli.xyz",
      origin: "https://sandboxedcli.xyz",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/github/workspace/pr", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requireGitHubSession.mockResolvedValue({ accessToken: "gho_token" });
    identity.getOrCreateWorkspaceIdentity.mockResolvedValue({ sandboxName: "sandboxed-cli-test" });
    lock.withSandboxMutationLock.mockImplementation(async (_name: string, work: () => Promise<unknown>) =>
      work(),
    );
    runtime.getSandboxRuntime.mockReturnValue(runtime.sandboxRuntime);
    runtime.sandboxRuntime.commitAndPushActiveRepository.mockResolvedValue({
      fullName: "octocat/hello-world",
      branch: "sandboxedcli/test-change",
      baseBranch: "main",
      commitSha: "0123456789abcdef0123456789abcdef01234567",
    });
    github.createGitHubPullRequest.mockResolvedValue({
      number: 12,
      htmlUrl: "https://github.com/octocat/hello-world/pull/12",
      head: "sandboxedcli/test-change",
      base: "main",
      title: "Apply sandbox changes",
    });
  });

  it("pushes sandbox changes and opens a GitHub pull request", async () => {
    const response = await POST(
      prRequest({
        title: "Apply sandbox changes",
        branch: "sandboxedcli/test-change",
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      pushed: { fullName: "octocat/hello-world", branch: "sandboxedcli/test-change" },
      pullRequest: { number: 12, htmlUrl: "https://github.com/octocat/hello-world/pull/12" },
    });
    expect(runtime.sandboxRuntime.commitAndPushActiveRepository).toHaveBeenCalledWith(
      "sandboxed-cli-test",
      "gho_token",
      { branch: "sandboxedcli/test-change", message: "Apply sandbox changes" },
    );
    expect(github.createGitHubPullRequest).toHaveBeenCalledWith(
      "gho_token",
      "octocat/hello-world",
      expect.objectContaining({
        title: "Apply sandbox changes",
        head: "sandboxedcli/test-change",
        base: "main",
      }),
    );
  });
});
