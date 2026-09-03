import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  get: vi.fn(),
  getOrCreate: vi.fn(),
}));

vi.mock("@vercel/sandbox", () => ({
  APIError: class APIError extends Error {},
  Sandbox: sdk,
}));

import { VercelSandboxRuntime } from "./vercel-runtime";

function fakeSandbox(state: "running" | "stopped" = "running") {
  return {
    name: "sandboxed-cli-test",
    status: state,
    persistent: true,
    currentSnapshotId: state === "stopped" ? "snapshot-1" : undefined,
    createdAt: new Date("2026-09-03T00:00:00Z"),
    updatedAt: new Date("2026-09-03T00:01:00Z"),
    expiresAt: new Date("2026-09-03T00:15:00Z"),
    timeout: 900_000,
    vcpus: 2,
    memory: 4096,
    totalActiveCpuDurationMs: 100,
    totalDurationMs: 200,
    totalIngressBytes: 300,
    totalEgressBytes: 400,
    currentSession: () => ({ sessionId: "session-1" }),
    openInteractive: vi.fn(async () => ({ url: "wss://controller.example", token: "pty-token" })),
    stop: vi.fn(async () => ({ snapshot: { id: "snapshot-1" } })),
    extendTimeout: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    runCommand: vi.fn(async () => ({ exitCode: 0, stdout: async () => "", stderr: async () => "" })),
    writeFiles: vi.fn(async () => undefined),
  };
}

describe("VercelSandboxRuntime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VERCEL_OIDC_TOKEN = "test-token";
  });

  it("creates or resumes a persistent named sandbox", async () => {
    const sandbox = fakeSandbox();
    sdk.getOrCreate.mockResolvedValue(sandbox);

    const status = await new VercelSandboxRuntime().ensureRunning("sandboxed-cli-test");

    expect(sdk.getOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "sandboxed-cli-test",
        persistent: true,
        resume: true,
        keepLastSnapshots: { count: 1, deleteEvicted: true },
      }),
    );
    expect(status).toMatchObject({
      state: "running",
      filesystemPreserved: true,
      processMemoryPreserved: false,
    });
  });

  it("issues an interactive tmux-backed terminal connection", async () => {
    const sandbox = fakeSandbox();
    sdk.getOrCreate.mockResolvedValue(sandbox);

    const connection = await new VercelSandboxRuntime().openTerminal(
      "sandboxed-cli-test",
      "terminal-one",
      { cols: 120, rows: 40 },
    );

    expect(sandbox.openInteractive).toHaveBeenCalledOnce();
    expect(connection.websocketToken).toBe("pty-token");
    expect(connection.start).toMatchObject({
      command: "tmux",
      args: expect.arrayContaining(["-A", "sc-terminal-one"]),
      cols: 120,
      rows: 40,
    });
    expect(connection.start.args).toContain("/vercel/sandbox/.sandboxedcli/bashrc");
  });

  it("reports sandbox image health from the baked environment command", async () => {
    const sandbox = fakeSandbox();
    sandbox.runCommand.mockResolvedValueOnce({
      exitCode: 0,
      stdout: async () =>
        JSON.stringify({
          status: "ok",
          workspace: "/vercel/sandbox",
          stateDirectory: "/vercel/sandbox/.sandboxedcli",
          checks: [{ name: "version:codex", status: "ok", detail: "0.153.0" }],
        }),
      stderr: async () => "",
    });
    sdk.get.mockResolvedValueOnce(sandbox);

    await expect(new VercelSandboxRuntime().checkEnvironment("sandboxed-cli-test")).resolves.toMatchObject({
      status: "ok",
      workspace: "/vercel/sandbox",
      checks: [{ name: "version:codex", status: "ok" }],
    });
    expect(sandbox.runCommand).toHaveBeenCalledWith("sh", expect.arrayContaining(["-lc"]));
  });

  it("degrades environment health when the custom health command is unavailable", async () => {
    const sandbox = fakeSandbox();
    sandbox.runCommand.mockResolvedValueOnce({
      exitCode: 127,
      stdout: async () => "sandboxed-health missing",
      stderr: async () => "",
    });
    sdk.get.mockResolvedValueOnce(sandbox);

    await expect(new VercelSandboxRuntime().checkEnvironment("sandboxed-cli-test")).resolves.toMatchObject({
      status: "degraded",
      checks: [{ name: "sandboxed-health", status: "fail", detail: "sandboxed-health missing" }],
    });
  });

  it("clones a GitHub repository into the persistent sandbox workspace", async () => {
    const sandbox = fakeSandbox();
    sdk.getOrCreate.mockResolvedValue(sandbox);

    await expect(
      new VercelSandboxRuntime().cloneRepository(
        "sandboxed-cli-test",
        {
          fullName: "octocat/hello-world",
          cloneUrl: "https://github.com/octocat/hello-world.git",
          defaultBranch: "main",
        },
        "gho_token",
        { login: "octocat", email: null },
      ),
    ).resolves.toEqual({
      fullName: "octocat/hello-world",
      branch: "main",
      directory: "/vercel/sandbox/repos/octocat__hello-world",
      alreadyPresent: false,
    });

    expect(sandbox.runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        cmd: "sh",
        env: { GITHUB_TOKEN: "gho_token" },
        cwd: "/vercel/sandbox",
      }),
    );
    const [[command]] = sandbox.runCommand.mock.calls as unknown as [[{ args: string[] }]];
    expect(command.args.join(" ")).not.toContain("gho_token");
    expect(command.args.join(" ")).toContain("active_repo_path");
    expect(command.args.join(" ")).toContain("active_repo_full_name");
    expect(command.args.join(" ")).toContain("active_repo_default_branch");
  });

  it("reports an already cloned repository without failing", async () => {
    const sandbox = fakeSandbox();
    sandbox.runCommand.mockResolvedValueOnce({
      exitCode: 17,
      stdout: async () => "",
      stderr: async () => "",
    });
    sdk.getOrCreate.mockResolvedValue(sandbox);

    await expect(
      new VercelSandboxRuntime().cloneRepository(
        "sandboxed-cli-test",
        {
          fullName: "octocat/hello-world",
          cloneUrl: "https://github.com/octocat/hello-world.git",
          defaultBranch: "main",
        },
        "gho_token",
        { login: "octocat", email: "octocat@example.com" },
      ),
    ).resolves.toMatchObject({ alreadyPresent: true });
  });

  it("rejects unsafe branch names before running sandbox commands", async () => {
    const sandbox = fakeSandbox();
    sdk.getOrCreate.mockResolvedValue(sandbox);

    await expect(
      new VercelSandboxRuntime().cloneRepository(
        "sandboxed-cli-test",
        {
          fullName: "octocat/hello-world",
          cloneUrl: "https://github.com/octocat/hello-world.git",
          defaultBranch: "main",
        },
        "gho_token",
        { login: "octocat", email: null },
        "../main",
      ),
    ).rejects.toThrow("Branch names may only contain safe Git ref characters.");
    expect(sdk.getOrCreate).not.toHaveBeenCalled();
  });

  it("reads git status from the active sandbox repository", async () => {
    const sandbox = fakeSandbox();
    sandbox.runCommand.mockResolvedValueOnce({
      exitCode: 0,
      stdout: async () => "/vercel/sandbox/repos/octocat__hello-world\n## main...origin/main\n M README.md\n",
      stderr: async () => "",
    });
    sdk.get.mockResolvedValueOnce(sandbox);

    await expect(new VercelSandboxRuntime().gitStatus("sandboxed-cli-test")).resolves.toEqual({
      repositoryDirectory: "/vercel/sandbox/repos/octocat__hello-world",
      output: "## main...origin/main\n M README.md\n",
    });
  });

  it("reads a bounded git diff from the active sandbox repository", async () => {
    const sandbox = fakeSandbox();
    sandbox.runCommand.mockResolvedValueOnce({
      exitCode: 0,
      stdout: async () => "/vercel/sandbox/repos/octocat__hello-world\n README.md | 1 +\n+hello\n",
      stderr: async () => "",
    });
    sdk.get.mockResolvedValueOnce(sandbox);

    await expect(new VercelSandboxRuntime().gitDiff("sandboxed-cli-test")).resolves.toEqual({
      repositoryDirectory: "/vercel/sandbox/repos/octocat__hello-world",
      output: " README.md | 1 +\n+hello\n",
      truncated: false,
    });
  });

  it("commits and pushes active repository changes to a sandbox branch", async () => {
    const sandbox = fakeSandbox();
    sandbox.runCommand.mockResolvedValueOnce({
      exitCode: 0,
      stdout: async () =>
        "octocat/hello-world\nsandboxedcli/test-change\nmain\n0123456789abcdef0123456789abcdef01234567\n",
      stderr: async () => "",
    });
    sdk.get.mockResolvedValueOnce(sandbox);

    await expect(
      new VercelSandboxRuntime().commitAndPushActiveRepository("sandboxed-cli-test", "gho_token", {
        branch: "sandboxedcli/test-change",
        message: "Apply sandbox changes",
      }),
    ).resolves.toEqual({
      fullName: "octocat/hello-world",
      branch: "sandboxedcli/test-change",
      baseBranch: "main",
      commitSha: "0123456789abcdef0123456789abcdef01234567",
    });

    expect(sandbox.runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        cmd: "sh",
        env: { GITHUB_TOKEN: "gho_token" },
        cwd: "/vercel/sandbox",
      }),
    );
    const [[command]] = sandbox.runCommand.mock.calls as unknown as [[{ args: string[] }]];
    expect(command.args.join(" ")).toContain("push origin");
    expect(command.args.join(" ")).not.toContain("gho_token");
  });

  it("reports clean active repositories before trying to open delivery", async () => {
    const sandbox = fakeSandbox();
    sandbox.runCommand.mockResolvedValueOnce({
      exitCode: 19,
      stdout: async () => "",
      stderr: async () => "",
    });
    sdk.get.mockResolvedValueOnce(sandbox);

    await expect(
      new VercelSandboxRuntime().commitAndPushActiveRepository("sandboxed-cli-test", "gho_token", {
        branch: "sandboxedcli/test-change",
        message: "Apply sandbox changes",
      }),
    ).rejects.toThrow("There are no repository changes to deliver.");
  });

  it("stops to a snapshot and permanently deletes snapshots on destroy", async () => {
    const running = fakeSandbox("running");
    const stopped = fakeSandbox("stopped");
    sdk.get.mockResolvedValueOnce(running).mockResolvedValueOnce(stopped).mockResolvedValueOnce(stopped);
    const runtime = new VercelSandboxRuntime();

    const paused = await runtime.pause("sandboxed-cli-test");
    expect(running.stop).toHaveBeenCalledOnce();
    expect(paused).toMatchObject({ snapshotId: "snapshot-1", sandbox: { state: "stopped" } });

    await runtime.destroy("sandboxed-cli-test");
    expect(stopped.delete).toHaveBeenCalledWith({ deleteOrphanSnapshots: true });
  });
});
