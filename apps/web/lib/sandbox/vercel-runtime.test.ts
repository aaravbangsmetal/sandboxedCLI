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
    runCommand: vi.fn(async () => ({ exitCode: 0, stderr: async () => "" })),
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
