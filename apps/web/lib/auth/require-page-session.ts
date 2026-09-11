import { redirect } from "next/navigation";

import { getGitHubSession } from "./session";

export async function requireGitHubPageSession() {
  const session = await getGitHubSession();
  if (!session) redirect("/auth");
  return session;
}
