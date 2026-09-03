import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.GITHUB_CLIENT_ID = "client-id";
});

import {
  createGitHubPullRequest,
  exchangeGitHubCode,
  fetchGitHubViewer,
  githubAuthorizeUrl,
  listGitHubRepositories,
} from "./client";

describe("GitHub client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates an OAuth authorization URL with state and scopes", () => {
    const url = new URL(githubAuthorizeUrl("state-token"));

    expect(url.origin).toBe("https://github.com");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("state")).toBe("state-token");
    expect(url.searchParams.get("scope")).toContain("repo");
  });

  it("exchanges an OAuth code for a token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ access_token: "gho_token", scope: "repo", token_type: "bearer" }),
      ),
    );

    await expect(exchangeGitHubCode("code")).resolves.toEqual({
      accessToken: "gho_token",
      scope: "repo",
      tokenType: "bearer",
    });
  });

  it("normalizes viewer and repository responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const href = String(url);
        if (href.endsWith("/user")) {
          return Response.json({
            id: 1,
            login: "octocat",
            name: null,
            avatar_url: "https://avatars.githubusercontent.com/u/1",
            html_url: "https://github.com/octocat",
          });
        }
        if (href.endsWith("/user/emails")) {
          return Response.json([{ email: "octocat@example.com", primary: true, verified: true }]);
        }
        return Response.json([
          {
            id: 10,
            name: "hello-world",
            full_name: "octocat/hello-world",
            private: false,
            html_url: "https://github.com/octocat/hello-world",
            clone_url: "https://github.com/octocat/hello-world.git",
            default_branch: "main",
            pushed_at: "2026-09-03T00:00:00Z",
            permissions: { pull: true, push: true },
          },
        ]);
      }),
    );

    await expect(fetchGitHubViewer("gho_token")).resolves.toMatchObject({
      login: "octocat",
      email: "octocat@example.com",
    });
    await expect(listGitHubRepositories("gho_token")).resolves.toMatchObject([
      { fullName: "octocat/hello-world", permissions: { pull: true, push: true } },
    ]);
  });

  it("creates a pull request for a pushed sandbox branch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          number: 12,
          html_url: "https://github.com/octocat/hello-world/pull/12",
          title: "Sandbox changes",
          head: { ref: "sandboxedcli/change" },
          base: { ref: "main" },
        }),
      ),
    );

    await expect(
      createGitHubPullRequest("gho_token", "octocat/hello-world", {
        title: "Sandbox changes",
        body: "Created from sandboxed/cli.",
        head: "sandboxedcli/change",
        base: "main",
      }),
    ).resolves.toEqual({
      number: 12,
      htmlUrl: "https://github.com/octocat/hello-world/pull/12",
      title: "Sandbox changes",
      head: "sandboxedcli/change",
      base: "main",
    });
  });
});
