import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { getGitHubConnection, type GitHubConnection } from "./github-connection";

export interface GitHubSession extends GitHubConnection {
  account: {
    id: string;
    createdAt: string;
    lastSignInAt: string | null;
  };
}

export async function getGitHubSession(): Promise<GitHubSession | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const connection = await getGitHubConnection(data.user.id);
  if (!connection) return null;
  return {
    ...connection,
    account: {
      id: data.user.id,
      createdAt: data.user.created_at,
      lastSignInAt: data.user.last_sign_in_at ?? null,
    },
  };
}

export async function clearGitHubSession() {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) throw error;
}
