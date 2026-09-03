import { NextResponse } from "next/server";

import { githubAuthConfig } from "@/lib/auth/config";
import { saveGitHubConnection } from "@/lib/auth/github-connection";
import { fetchGitHubViewer } from "@/lib/github/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectWithError(error: string, request: Request) {
  const url = new URL("/auth", request.url);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code");
  if (!code) return redirectWithError("github_code_missing", request);

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    if (!data.user || !data.session?.provider_token) {
      throw new Error("GitHub did not return provider access.");
    }

    const viewer = await fetchGitHubViewer(data.session.provider_token);
    await saveGitHubConnection(data.user.id, {
      accessToken: data.session.provider_token,
      scope: githubAuthConfig.scope,
      tokenType: "bearer",
      user: {
        id: viewer.id,
        login: viewer.login,
        name: viewer.name,
        avatarUrl: viewer.avatarUrl,
        htmlUrl: viewer.htmlUrl,
        email: viewer.email,
      },
    });
    return NextResponse.redirect(new URL("/setup", request.url));
  } catch {
    return redirectWithError("github_exchange_failed", request);
  }
}
