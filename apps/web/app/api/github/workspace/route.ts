import { requireGitHubSession } from "@/lib/auth/require-session";
import { getOrCreateWorkspaceIdentity } from "@/lib/sandbox/identity";
import { sandboxErrorResponse, sandboxJson } from "@/lib/sandbox/http";
import { getSandboxRuntime } from "@/lib/sandbox/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireGitHubSession();
    const identity = await getOrCreateWorkspaceIdentity();
    const status = await getSandboxRuntime().gitStatus(identity.sandboxName);
    return sandboxJson({ status });
  } catch (error) {
    return sandboxErrorResponse(error);
  }
}
