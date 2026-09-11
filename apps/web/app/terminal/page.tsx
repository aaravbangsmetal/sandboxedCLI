import { requireGitHubPageSession } from "@/lib/auth/require-page-session";
import { TerminalWorkspace } from "@/components/terminal/terminal-workspace";

export default async function TerminalPage() {
  await requireGitHubPageSession();
  return <TerminalWorkspace />;
}
