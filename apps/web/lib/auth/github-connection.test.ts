import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => database,
}));

import { getGitHubConnection, saveGitHubConnection } from "./github-connection";

const connection = {
  accessToken: "gho_secret-token",
  scope: "repo read:user",
  tokenType: "bearer",
  user: {
    id: 42,
    login: "octocat",
    name: "The Octocat",
    email: "octocat@github.com",
    avatarUrl: "https://github.com/images/error/octocat_happy.gif",
    htmlUrl: "https://github.com/octocat",
  },
};

describe("GitHub connection persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GITHUB_TOKEN_ENCRYPTION_KEY = "test-only-provider-token-encryption-key";
  });

  it("stores encrypted provider access for a Supabase user", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    database.from.mockReturnValue({ upsert });

    await saveGitHubConnection("supabase-user-id", connection);

    const row = upsert.mock.calls[0][0];
    expect(database.from).toHaveBeenCalledWith("github_connections");
    expect(row.user_id).toBe("supabase-user-id");
    expect(row.github_login).toBe("octocat");
    expect(row.encrypted_access_token).not.toContain(connection.accessToken);
    expect(upsert.mock.calls[0][1]).toEqual({ onConflict: "user_id" });
  });

  it("loads and decrypts a connection", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    database.from.mockReturnValueOnce({ upsert });
    await saveGitHubConnection("supabase-user-id", connection);
    const encryptedAccessToken = upsert.mock.calls[0][0].encrypted_access_token;

    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        github_user_id: 42,
        github_login: "octocat",
        github_name: "The Octocat",
        github_email: "octocat@github.com",
        github_avatar_url: "https://github.com/images/error/octocat_happy.gif",
        github_html_url: "https://github.com/octocat",
        encrypted_access_token: encryptedAccessToken,
        granted_scope: "repo read:user",
        token_type: "bearer",
        connected_at: "2026-09-04T00:00:00.000Z",
      },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    database.from.mockReturnValueOnce({ select });

    await expect(getGitHubConnection("supabase-user-id")).resolves.toEqual({
      ...connection,
      connectedAt: "2026-09-04T00:00:00.000Z",
    });
    expect(eq).toHaveBeenCalledWith("user_id", "supabase-user-id");
  });

  it("returns null when no provider connection exists", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    database.from.mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) });

    await expect(getGitHubConnection("supabase-user-id")).resolves.toBeNull();
  });
});
