import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { decryptProviderToken, encryptProviderToken } from "./token-vault";

export interface GitHubIdentity {
  id: number;
  login: string;
  name: string | null;
  avatarUrl: string;
  htmlUrl: string;
  email: string | null;
}

export interface GitHubConnection {
  accessToken: string;
  scope: string;
  tokenType: string;
  user: GitHubIdentity;
  connectedAt: string;
}

interface StoredGitHubConnection {
  github_user_id: number;
  github_login: string;
  github_name: string | null;
  github_email: string | null;
  github_avatar_url: string;
  github_html_url: string;
  encrypted_access_token: string;
  granted_scope: string;
  token_type: string;
  connected_at: string;
}

export async function saveGitHubConnection(
  userId: string,
  connection: Omit<GitHubConnection, "connectedAt">,
) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("github_connections").upsert(
    {
      user_id: userId,
      github_user_id: connection.user.id,
      github_login: connection.user.login,
      github_name: connection.user.name,
      github_email: connection.user.email,
      github_avatar_url: connection.user.avatarUrl,
      github_html_url: connection.user.htmlUrl,
      encrypted_access_token: encryptProviderToken(connection.accessToken),
      granted_scope: connection.scope,
      token_type: connection.tokenType,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(`Unable to persist GitHub access: ${error.message}`);
}

export async function getGitHubConnection(userId: string): Promise<GitHubConnection | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("github_connections")
    .select(
      "github_user_id,github_login,github_name,github_email,github_avatar_url,github_html_url,encrypted_access_token,granted_scope,token_type,connected_at",
    )
    .eq("user_id", userId)
    .maybeSingle<StoredGitHubConnection>();
  if (error) throw new Error(`Unable to load GitHub access: ${error.message}`);
  if (!data) return null;

  return {
    accessToken: decryptProviderToken(data.encrypted_access_token),
    scope: data.granted_scope,
    tokenType: data.token_type,
    connectedAt: data.connected_at,
    user: {
      id: data.github_user_id,
      login: data.github_login,
      name: data.github_name,
      email: data.github_email,
      avatarUrl: data.github_avatar_url,
      htmlUrl: data.github_html_url,
    },
  };
}
