import { NextResponse } from "next/server";

import { assertGitHubOAuthConfigured } from "@/lib/auth/config";
import { createOAuthState, setOAuthStateCookie } from "@/lib/auth/session";
import { githubAuthorizeUrl } from "@/lib/github/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    assertGitHubOAuthConfigured();
    const state = createOAuthState();
    await setOAuthStateCookie(state);
    return NextResponse.redirect(githubAuthorizeUrl(state));
  } catch (error) {
    const message = error instanceof Error ? error.message : "GitHub OAuth is unavailable.";
    return NextResponse.json({ error: message, code: "github_oauth_unavailable" }, { status: 503 });
  }
}
