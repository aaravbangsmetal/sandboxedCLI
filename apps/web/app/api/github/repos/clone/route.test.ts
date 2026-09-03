import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  requireGitHubSession: vi.fn(),
}));

const github = vi.hoisted(() => ({
  listGitHubRepositories: vi.fn(),
}));

const identity = vi.hoisted(() => ({
  getOrCreateWorkspaceIdentity: vi.fn(),
}));

const lock = vi.hoisted(() => ({
  withSandboxMutationLock: vi.fn(),
}));

const runtime = vi.hoisted(() => ({
  sandboxRuntime: {
    cloneRepository: vi.fn(),
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

const repo = {
  id: 1,
  name: "hello-world",
  fullName: "octocat/hello-world",
  private: false,
  htmlUrl: "https://github.com/octocat/hello-world",
  cloneUrl: "https://github.com/octocat/hello-world.git",
  defaultBranch: "main",
  pushedAt: null,
  permissions: { admin: false, maintain: false, push: true, triage: false, pull: true },
};

function cloneRequest(body: unknown) {
  return new Request("https://sandboxedcli.xyz/api/github/repos/clone", {
    method: "POST",
    headers: {
      host: "sandboxedcli.xyz",
      origin: "https://sandboxedcli.xyz",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/github/repos/clone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requireGitHubSession.mockResolvedValue({
      accessToken: "gho_token",
      user: { login: "octocat", email: "octocat@example.com" },
    });
    github.listGitHubRepositories.mockResolvedValue([repo]);
    identity.getOrCreateWorkspaceIdentity.mockResolvedValue({ sandboxName: "sandboxed-cli-test" });
    lock.withSandboxMutationLock.mockImplementation(async (_name: string, work: () => Promise<unknown>) =>
      work(),
    );
    runtime.getSandboxRuntime.mockReturnValue(runtime.sandboxRuntime);
    runtime.sandboxRuntime.cloneRepository.mockResolvedValue({
      fullName: repo.fullName,
      branch: "main",
      directory: "/vercel/sandbox/repos/octocat__hello-world",
      alreadyPresent: false,
    });
  });

  it("clones an authenticated repository into the current sandbox", async () => {
    const response = await POST(cloneRequest({ fullName: "octocat/hello-world" }));

    await expect(response.json()).resolves.toEqual({
      clone: {
        fullName: repo.fullName,
        branch: "main",
        directory: "/vercel/sandbox/repos/octocat__hello-world",
        alreadyPresent: false,
      },
    });
    expect(runtime.sandboxRuntime.cloneRepository).toHaveBeenCalledWith(
      "sandboxed-cli-test",
      repo,
      "gho_token",
      { login: "octocat", email: "octocat@example.com" },
      undefined,
    );
  });

  it("rejects repositories outside the authenticated repo list", async () => {
    const response = await POST(cloneRequest({ fullName: "octocat/private" }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: "repo_not_found" });
    expect(runtime.sandboxRuntime.cloneRepository).not.toHaveBeenCalled();
  });
});
