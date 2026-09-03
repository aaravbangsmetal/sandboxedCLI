import { beforeEach, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({
  getOrCreateWorkspaceIdentity: vi.fn(),
}));

const security = vi.hoisted(() => ({
  assertSafeMutationRequest: vi.fn(),
}));

const lock = vi.hoisted(() => ({
  withSandboxMutationLock: vi.fn(),
}));

const runtime = vi.hoisted(() => ({
  sandboxRuntime: {
    ensureRunning: vi.fn(),
    checkEnvironment: vi.fn(),
  },
  getSandboxRuntime: vi.fn(),
}));

vi.mock("@/lib/sandbox/identity", () => identity);
vi.mock("@/lib/sandbox/request-security", () => security);
vi.mock("@/lib/sandbox/mutation-lock", () => lock);
vi.mock("@/lib/sandbox/runtime", () => ({
  getSandboxRuntime: runtime.getSandboxRuntime,
}));

import { POST } from "./route";

describe("POST /api/sandbox/environment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    identity.getOrCreateWorkspaceIdentity.mockResolvedValue({ sandboxName: "sandboxed-cli-test" });
    lock.withSandboxMutationLock.mockImplementation(async (_name: string, work: () => Promise<unknown>) =>
      work(),
    );
    runtime.getSandboxRuntime.mockReturnValue(runtime.sandboxRuntime);
    runtime.sandboxRuntime.ensureRunning.mockResolvedValue({
      name: "sandboxed-cli-test",
      state: "running",
      persistent: true,
      filesystemPreserved: true,
      processMemoryPreserved: false,
    });
    runtime.sandboxRuntime.checkEnvironment.mockResolvedValue({
      status: "ok",
      workspace: "/vercel/sandbox",
      stateDirectory: "/vercel/sandbox/.sandboxedcli",
      image: "sandboxed-cli-agent:dev",
      checks: [],
    });
  });

  it("ensures the sandbox is running and returns the environment health report", async () => {
    const response = await POST(
      new Request("https://sandboxedcli.xyz/api/sandbox/environment", {
        method: "POST",
        headers: { origin: "https://sandboxedcli.xyz", "content-type": "application/json" },
        body: "{}",
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      configured: true,
      environment: { status: "ok", image: "sandboxed-cli-agent:dev" },
    });
    expect(runtime.sandboxRuntime.ensureRunning).toHaveBeenCalledWith("sandboxed-cli-test");
    expect(runtime.sandboxRuntime.checkEnvironment).toHaveBeenCalledWith("sandboxed-cli-test");
    expect(lock.withSandboxMutationLock).toHaveBeenCalledWith("sandboxed-cli-test", expect.any(Function));
  });
});
