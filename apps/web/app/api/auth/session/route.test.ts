import { beforeEach, describe, expect, it, vi } from "vitest";

const authSession = vi.hoisted(() => ({
  clearGitHubSession: vi.fn(),
  getGitHubSession: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => authSession);

import { DELETE, GET } from "./route";

describe("/api/auth/session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the current user without exposing the access token", async () => {
    authSession.getGitHubSession.mockResolvedValue({
      accessToken: "gho_token",
      scope: "repo",
      connectedAt: "2026-09-01T10:00:00.000Z",
      user: { login: "octocat" },
      account: {
        id: "supabase-user-id",
        createdAt: "2026-09-01T10:00:00.000Z",
        lastSignInAt: "2026-09-04T12:00:00.000Z",
      },
    });

    const response = await GET();

    await expect(response.json()).resolves.toEqual({
      authenticated: true,
      user: { login: "octocat" },
      scope: "repo",
      connectedAt: "2026-09-01T10:00:00.000Z",
      account: {
        id: "supabase-user-id",
        createdAt: "2026-09-01T10:00:00.000Z",
        lastSignInAt: "2026-09-04T12:00:00.000Z",
      },
    });
  });

  it("clears the session on same-origin delete", async () => {
    const response = await DELETE(
      new Request("https://sandboxedcli.xyz/api/auth/session", {
        method: "DELETE",
        headers: {
          host: "sandboxedcli.xyz",
          origin: "https://sandboxedcli.xyz",
          "content-type": "application/json",
        },
        body: "{}",
      }),
    );

    await expect(response.json()).resolves.toEqual({ authenticated: false });
    expect(authSession.clearGitHubSession).toHaveBeenCalledOnce();
  });
});
