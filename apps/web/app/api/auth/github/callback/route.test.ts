import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ exchangeCodeForSession: vi.fn() }));
const connection = vi.hoisted(() => ({ saveGitHubConnection: vi.fn() }));
const github = vi.hoisted(() => ({ fetchGitHubViewer: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ auth })),
}));
vi.mock("@/lib/auth/github-connection", () => connection);
vi.mock("@/lib/github/client", () => github);

import { GET } from "./route";

describe("GET /api/auth/github/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.exchangeCodeForSession.mockResolvedValue({
      data: {
        user: { id: "supabase-user-id" },
        session: { provider_token: "gho_token" },
      },
      error: null,
    });
    github.fetchGitHubViewer.mockResolvedValue({
      id: 42,
      login: "octocat",
      name: "The Octocat",
      avatarUrl: "https://avatars.example/octocat",
      htmlUrl: "https://github.com/octocat",
      email: "octocat@example.com",
    });
  });

  it("exchanges the PKCE code and persists GitHub access for the Supabase user", async () => {
    const response = await GET(
      new Request("https://sandboxedcli.xyz/api/auth/github/callback?code=supabase-pkce-code"),
    );

    expect(response.headers.get("location")).toBe("https://sandboxedcli.xyz/setup");
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("supabase-pkce-code");
    expect(connection.saveGitHubConnection).toHaveBeenCalledWith(
      "supabase-user-id",
      expect.objectContaining({
        accessToken: "gho_token",
        scope: "read:user user:email repo",
        user: expect.objectContaining({ login: "octocat" }),
      }),
    );
  });

  it("rejects callbacks without an authorization code", async () => {
    const response = await GET(
      new Request("https://sandboxedcli.xyz/api/auth/github/callback?error=access_denied"),
    );
    expect(response.headers.get("location")).toBe(
      "https://sandboxedcli.xyz/auth?error=github_code_missing",
    );
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("rejects sessions without GitHub provider access", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({
      data: { user: { id: "supabase-user-id" }, session: {} },
      error: null,
    });
    const response = await GET(
      new Request("https://sandboxedcli.xyz/api/auth/github/callback?code=supabase-pkce-code"),
    );
    expect(response.headers.get("location")).toBe(
      "https://sandboxedcli.xyz/auth?error=github_exchange_failed",
    );
    expect(connection.saveGitHubConnection).not.toHaveBeenCalled();
  });
});
