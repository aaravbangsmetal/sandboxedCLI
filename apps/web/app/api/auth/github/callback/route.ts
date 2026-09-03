import { NextResponse } from "next/server";

import { githubAuthConfig } from "@/lib/auth/config";
import {
  consumeOAuthStateCookie,
  setGitHubSession,
  verifyOAuthState,
  type GitHubSession,
} from "@/lib/auth/session";
import { exchangeGitHubCode, fetchGitHubViewer } from "@/lib/github/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectTo(path: string, request: Request) {
  return NextResponse.redirect(new URL(path, request.url));
}

function redirectWithError(error: string, request: Request) {
  const url = new URL("/auth", request.url);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const storedState = await consumeOAuthStateCookie();

  if (!code || !state || !storedState || state !== storedState || !verifyOAuthState(state)) {
    return redirectWithError("github_state_invalid", request);
  }

  try {
    const token = await exchangeGitHubCode(code);
    const viewer = await fetchGitHubViewer(token.accessToken);
    const createdAt = Date.now();
    const session: GitHubSession = {
      accessToken: token.accessToken,
      scope: token.scope,
      tokenType: token.tokenType,
      user: {
        id: viewer.id,
        login: viewer.login,
        name: viewer.name,
        avatarUrl: viewer.avatarUrl,
        htmlUrl: viewer.htmlUrl,
        email: viewer.email,
      },
      createdAt,
      expiresAt: createdAt + githubAuthConfig.sessionMaxAgeSeconds * 1_000,
    };
    await setGitHubSession(session);
    return redirectTo("/setup", request);
  } catch {
    return redirectWithError("github_exchange_failed", request);
  }
}
