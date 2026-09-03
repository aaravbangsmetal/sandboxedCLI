import { NextResponse } from "next/server";

import { githubAuthConfig } from "@/lib/auth/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const callbackUrl = new URL("/api/auth/github/callback", request.url);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: callbackUrl.toString(),
        scopes: githubAuthConfig.scope,
      },
    });
    if (error || !data.url) throw error || new Error("Supabase did not return an OAuth URL.");
    return NextResponse.redirect(data.url);
  } catch (error) {
    const message = error instanceof Error ? error.message : "GitHub OAuth is unavailable.";
    return NextResponse.json({ error: message, code: "github_oauth_unavailable" }, { status: 503 });
  }
}
