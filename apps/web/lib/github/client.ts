import "server-only";

import { githubAuthConfig } from "@/lib/auth/config";

export interface GitHubViewer {
  id: number;
  login: string;
  name: string | null;
  avatarUrl: string;
  htmlUrl: string;
  email: string | null;
}

export interface GitHubRepository {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
  cloneUrl: string;
  defaultBranch: string;
  pushedAt: string | null;
  permissions: {
    admin: boolean;
    maintain: boolean;
    push: boolean;
    triage: boolean;
    pull: boolean;
  };
}

export interface GitHubPullRequest {
  number: number;
  htmlUrl: string;
  head: string;
  base: string;
  title: string;
}

interface OAuthTokenResponse {
  access_token?: unknown;
  scope?: unknown;
  token_type?: unknown;
  error?: unknown;
  error_description?: unknown;
}

interface GitHubUserResponse {
  id?: unknown;
  login?: unknown;
  name?: unknown;
  avatar_url?: unknown;
  html_url?: unknown;
  email?: unknown;
}

interface GitHubEmailResponse {
  email?: unknown;
  primary?: unknown;
  verified?: unknown;
}

interface GitHubRepoResponse {
  id?: unknown;
  name?: unknown;
  full_name?: unknown;
  private?: unknown;
  html_url?: unknown;
  clone_url?: unknown;
  default_branch?: unknown;
  pushed_at?: unknown;
  permissions?: Partial<GitHubRepository["permissions"]>;
}

interface GitHubPullRequestResponse {
  number?: unknown;
  html_url?: unknown;
  head?: { ref?: unknown };
  base?: { ref?: unknown };
  title?: unknown;
}

export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

function githubHeaders(accessToken?: string) {
  return {
    accept: "application/vnd.github+json",
    "x-github-api-version": githubAuthConfig.apiVersion,
    ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
  };
}

async function githubJson<T>(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...githubHeaders(),
      ...init.headers,
    },
  });
  const body = (await response.json().catch(() => null)) as T | null;
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "message" in body && typeof body.message === "string"
        ? body.message
        : `GitHub request failed (${response.status}).`;
    throw new GitHubApiError(message, response.status);
  }
  if (!body) throw new GitHubApiError("GitHub returned an empty response.", response.status);
  return body;
}

export function githubAuthorizeUrl(state: string) {
  const params = new URLSearchParams({
    client_id: githubAuthConfig.clientId,
    scope: githubAuthConfig.scope,
    state,
  });
  if (githubAuthConfig.callbackUrl) params.set("redirect_uri", githubAuthConfig.callbackUrl);
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeGitHubCode(code: string) {
  const body = await githubJson<OAuthTokenResponse>("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      client_id: githubAuthConfig.clientId,
      client_secret: githubAuthConfig.clientSecret,
      code,
      ...(githubAuthConfig.callbackUrl ? { redirect_uri: githubAuthConfig.callbackUrl } : {}),
    }),
  });

  if (typeof body.error === "string") {
    throw new GitHubApiError(
      typeof body.error_description === "string" ? body.error_description : body.error,
      401,
    );
  }
  if (typeof body.access_token !== "string") {
    throw new GitHubApiError("GitHub did not return an access token.", 502);
  }
  return {
    accessToken: body.access_token,
    scope: typeof body.scope === "string" ? body.scope : "",
    tokenType: typeof body.token_type === "string" ? body.token_type : "bearer",
  };
}

function normalizeViewer(user: GitHubUserResponse, email: string | null): GitHubViewer {
  if (
    typeof user.id !== "number" ||
    typeof user.login !== "string" ||
    typeof user.avatar_url !== "string" ||
    typeof user.html_url !== "string"
  ) {
    throw new GitHubApiError("GitHub user response was incomplete.", 502);
  }

  return {
    id: user.id,
    login: user.login,
    name: typeof user.name === "string" ? user.name : null,
    avatarUrl: user.avatar_url,
    htmlUrl: user.html_url,
    email,
  };
}

function primaryEmail(emails: GitHubEmailResponse[]) {
  const email = emails.find(
    (candidate) =>
      candidate.primary === true &&
      candidate.verified === true &&
      typeof candidate.email === "string",
  );
  return typeof email?.email === "string" ? email.email : null;
}

export async function fetchGitHubViewer(accessToken: string) {
  const user = await githubJson<GitHubUserResponse>("https://api.github.com/user", {
    headers: githubHeaders(accessToken),
  });
  const emails = await githubJson<GitHubEmailResponse[]>("https://api.github.com/user/emails", {
    headers: githubHeaders(accessToken),
  }).catch(() => []);
  return normalizeViewer(user, primaryEmail(emails));
}

function normalizeRepository(repo: GitHubRepoResponse): GitHubRepository {
  if (
    typeof repo.id !== "number" ||
    typeof repo.name !== "string" ||
    typeof repo.full_name !== "string" ||
    typeof repo.private !== "boolean" ||
    typeof repo.html_url !== "string" ||
    typeof repo.clone_url !== "string" ||
    typeof repo.default_branch !== "string"
  ) {
    throw new GitHubApiError("GitHub repository response was incomplete.", 502);
  }

  return {
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    private: repo.private,
    htmlUrl: repo.html_url,
    cloneUrl: repo.clone_url,
    defaultBranch: repo.default_branch,
    pushedAt: typeof repo.pushed_at === "string" ? repo.pushed_at : null,
    permissions: {
      admin: repo.permissions?.admin === true,
      maintain: repo.permissions?.maintain === true,
      push: repo.permissions?.push === true,
      triage: repo.permissions?.triage === true,
      pull: repo.permissions?.pull === true,
    },
  };
}

export async function listGitHubRepositories(accessToken: string) {
  const repos = await githubJson<GitHubRepoResponse[]>(
    "https://api.github.com/user/repos?visibility=all&affiliation=owner,collaborator,organization_member&sort=pushed&per_page=100",
    { headers: githubHeaders(accessToken) },
  );
  return repos.map(normalizeRepository);
}

export async function createGitHubPullRequest(
  accessToken: string,
  fullName: string,
  input: { title: string; body: string; head: string; base: string },
): Promise<GitHubPullRequest> {
  const pullRequest = await githubJson<GitHubPullRequestResponse>(
    `https://api.github.com/repos/${encodeURIComponent(fullName).replace("%2F", "/")}/pulls`,
    {
      method: "POST",
      headers: { ...githubHeaders(accessToken), "content-type": "application/json" },
      body: JSON.stringify({
        title: input.title,
        body: input.body,
        head: input.head,
        base: input.base,
        maintainer_can_modify: true,
      }),
    },
  );
  if (
    typeof pullRequest.number !== "number" ||
    typeof pullRequest.html_url !== "string" ||
    typeof pullRequest.title !== "string" ||
    typeof pullRequest.head?.ref !== "string" ||
    typeof pullRequest.base?.ref !== "string"
  ) {
    throw new GitHubApiError("GitHub pull request response was incomplete.", 502);
  }
  return {
    number: pullRequest.number,
    htmlUrl: pullRequest.html_url,
    head: pullRequest.head.ref,
    base: pullRequest.base.ref,
    title: pullRequest.title,
  };
}
