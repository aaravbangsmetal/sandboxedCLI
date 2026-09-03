import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireGitHubSession: vi.fn() }));
const identity = vi.hoisted(() => ({
  getOrCreateWorkspaceIdentity: vi.fn(),
  getWorkspaceIdentity: vi.fn(),
}));
const runtime = vi.hoisted(() => ({
  sandboxRuntime: { openTerminal: vi.fn(), killTerminal: vi.fn() },
  getSandboxRuntime: vi.fn(),
}));

vi.mock("@/lib/auth/require-session", () => ({
  AuthenticationRequiredError: class AuthenticationRequiredError extends Error {},
  requireGitHubSession: auth.requireGitHubSession,
}));
vi.mock("@/lib/sandbox/identity", () => identity);
vi.mock("@/lib/sandbox/runtime", () => ({ getSandboxRuntime: runtime.getSandboxRuntime }));

import { DELETE, POST } from "./route";

function request(method: "POST" | "DELETE", body: unknown) {
  return new Request("https://sandboxedcli.xyz/api/sandbox/terminal", {
    method,
    headers: {
      host: "sandboxedcli.xyz",
      origin: "https://sandboxedcli.xyz",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("/api/sandbox/terminal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requireGitHubSession.mockResolvedValue({ accessToken: "gho_token" });
    identity.getOrCreateWorkspaceIdentity.mockResolvedValue({ sandboxName: "sandboxed-cli-user" });
    identity.getWorkspaceIdentity.mockResolvedValue({ sandboxName: "sandboxed-cli-user" });
    runtime.getSandboxRuntime.mockReturnValue(runtime.sandboxRuntime);
    runtime.sandboxRuntime.openTerminal.mockResolvedValue({
      terminalId: "terminal-one",
      websocketUrl: "wss://controller.example",
      websocketToken: "controller-token",
    });
  });

  it("opens a user-owned terminal with server-side GitHub access", async () => {
    const response = await POST(request("POST", { terminalId: "terminal-one", cols: 120, rows: 40 }));
    expect(response.status).toBe(200);
    expect(runtime.sandboxRuntime.openTerminal).toHaveBeenCalledWith(
      "sandboxed-cli-user",
      "terminal-one",
      { cols: 120, rows: 40 },
      "gho_token",
    );
    const body = await response.text();
    expect(body).not.toContain("gho_token");
  });

  it("requires authentication before terminating a terminal", async () => {
    await DELETE(request("DELETE", { terminalId: "terminal-one" }));
    expect(auth.requireGitHubSession).toHaveBeenCalledOnce();
    expect(runtime.sandboxRuntime.killTerminal).toHaveBeenCalledWith(
      "sandboxed-cli-user",
      "terminal-one",
    );
  });
});
