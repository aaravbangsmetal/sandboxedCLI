import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ getUser: vi.fn(), signOut: vi.fn() }));
const connections = vi.hoisted(() => ({ getGitHubConnection: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ auth })),
}));
vi.mock("./github-connection", () => connections);

import { clearGitHubSession, getGitHubSession } from "./session";

describe("Supabase-backed GitHub session", () => {
  beforeEach(() => vi.clearAllMocks());

  it("joins the verified Supabase user with persisted GitHub access", async () => {
    auth.getUser.mockResolvedValue({
      data: {
        user: {
          id: "supabase-user-id",
          created_at: "2026-09-01T10:00:00.000Z",
          last_sign_in_at: "2026-09-04T12:00:00.000Z",
        },
      },
      error: null,
    });
    connections.getGitHubConnection.mockResolvedValue({
      accessToken: "gho_token",
      scope: "repo",
      tokenType: "bearer",
      connectedAt: "2026-09-01T10:00:00.000Z",
      user: { login: "octocat" },
    });

    await expect(getGitHubSession()).resolves.toMatchObject({
      accessToken: "gho_token",
      user: { login: "octocat" },
      account: {
        id: "supabase-user-id",
        createdAt: "2026-09-01T10:00:00.000Z",
        lastSignInAt: "2026-09-04T12:00:00.000Z",
      },
    });
  });

  it("rejects an unverified or missing Supabase user", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error("invalid jwt") });
    await expect(getGitHubSession()).resolves.toBeNull();
    expect(connections.getGitHubConnection).not.toHaveBeenCalled();
  });

  it("requires a persisted GitHub connection", async () => {
    auth.getUser.mockResolvedValue({
      data: { user: { id: "supabase-user-id", created_at: "2026-09-01T10:00:00.000Z" } },
      error: null,
    });
    connections.getGitHubConnection.mockResolvedValue(null);
    await expect(getGitHubSession()).resolves.toBeNull();
  });

  it("signs out only the current Supabase session", async () => {
    auth.signOut.mockResolvedValue({ error: null });
    await clearGitHubSession();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
