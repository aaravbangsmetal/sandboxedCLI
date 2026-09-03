import { requireGitHubSession } from "@/lib/auth/require-session";
import { listGitHubRepositories } from "@/lib/github/client";
import { sandboxErrorResponse, sandboxJson } from "@/lib/sandbox/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireGitHubSession();
    const repositories = await listGitHubRepositories(session.accessToken);
    return sandboxJson({ repositories });
  } catch (error) {
    return sandboxErrorResponse(error);
  }
}
