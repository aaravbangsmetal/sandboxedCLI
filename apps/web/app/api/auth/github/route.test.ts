import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ signInWithOAuth: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ auth })),
}));

import { GET } from "./route";

describe("GET /api/auth/github", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects directly into Supabase GitHub OAuth", async () => {
    auth.signInWithOAuth.mockResolvedValue({
      data: { url: "https://project.supabase.co/auth/v1/authorize?provider=github" },
      error: null,
    });

    const response = await GET(new Request("https://sandboxedcli.xyz/api/auth/github"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://project.supabase.co/auth/v1/authorize?provider=github",
    );
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "github",
      options: {
        redirectTo: "https://sandboxedcli.xyz/api/auth/github/callback",
        scopes: "read:user user:email repo",
      },
    });
  });

  it("returns a service error when Supabase OAuth is unavailable", async () => {
    auth.signInWithOAuth.mockResolvedValue({
      data: { url: null },
      error: new Error("OAuth unavailable"),
    });

    const response = await GET(new Request("https://sandboxedcli.xyz/api/auth/github"));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "github_oauth_unavailable" });
  });
});
