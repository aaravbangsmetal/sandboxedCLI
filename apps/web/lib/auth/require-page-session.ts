import { redirect } from "next/navigation";

import { getGitHubSession } from "./session";

export async function requireGitHubPageSession() {
  // Browser tests mock the HTTP APIs. This opt-in applies only to development
  // pages with mock terminals; API authentication remains enforced.
  if (
    process.env.NODE_ENV === "development" &&
    process.env.SANDBOX_E2E_TEST_MODE === "1" &&
    process.env.NEXT_PUBLIC_SANDBOX_TRANSPORT === "mock"
  ) return;
  const session = await getGitHubSession();
  if (!session) redirect("/auth");
  return session;
}
