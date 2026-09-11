import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createGitHubPullRequest,
  fetchGitHubRepository,
  fetchGitHubViewer,
  listGitHubRepositories,
} from "./client";

describe("GitHub client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes viewer and repository responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const href = String(url);
        if (href.endsWith("/user")) {
          return new Response(
            JSON.stringify({
              id: 1,
              login: "octocat",
              name: null,
              avatar_url: "https://avatars.githubusercontent.com/u/1",
              html_url: "https://github.com/octocat",
            }),
            { headers: { "content-type": "application/json", "x-oauth-scopes": "read:user, repo" } },
          );
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
      grantedScope: "read:user repo",
    });
    await expect(listGitHubRepositories("gho_token")).resolves.toMatchObject([
      { fullName: "octocat/hello-world", permissions: { pull: true, push: true } },
    ]);
  });

  it("paginates repository access beyond GitHub's first page", async () => {
    const repository = (id: number) => ({
      id,
      name: `repo-${id}`,
      full_name: `octocat/repo-${id}`,
      private: false,
      html_url: `https://github.com/octocat/repo-${id}`,
      clone_url: `https://github.com/octocat/repo-${id}.git`,
      default_branch: "main",
      pushed_at: null,
      permissions: { pull: true, push: true },
    });
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const page = new URL(String(url)).searchParams.get("page");
      return Response.json(page === "1" ? Array.from({ length: 100 }, (_, id) => repository(id)) : [repository(100)]);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(listGitHubRepositories("gho_token")).resolves.toHaveLength(101);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fetches a single repository by owner and name", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toBe("https://api.github.com/repos/octocat/hello-world");
      return Response.json({
        id: 10,
        name: "hello-world",
        full_name: "octocat/hello-world",
        private: false,
        html_url: "https://github.com/octocat/hello-world",
        clone_url: "https://github.com/octocat/hello-world.git",
        default_branch: "main",
        pushed_at: null,
        permissions: { pull: true, push: true },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchGitHubRepository("gho_token", "octocat/hello-world")).resolves.toMatchObject({
      fullName: "octocat/hello-world",
      permissions: { pull: true, push: true },
    });
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
