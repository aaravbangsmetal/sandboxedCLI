import { requireGitHubSession } from "@/lib/auth/require-session";
import { fetchGitHubRepository } from "@/lib/github/client";
import { getOrCreateWorkspaceIdentity } from "@/lib/sandbox/identity";
import { sandboxErrorResponse, sandboxJson } from "@/lib/sandbox/http";
import { withSandboxMutationLock } from "@/lib/sandbox/mutation-lock";
import { assertSafeMutationRequest } from "@/lib/sandbox/request-security";
import { getSandboxRuntime } from "@/lib/sandbox/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseCloneRequest(body: unknown) {
  if (!body || typeof body !== "object") throw new SyntaxError("Clone requests require a JSON body.");
  const candidate = body as { fullName?: unknown; branch?: unknown };
  if (typeof candidate.fullName !== "string") throw new SyntaxError("Repository fullName is required.");
  if (candidate.branch !== undefined && typeof candidate.branch !== "string") {
    throw new SyntaxError("Repository branch must be a string.");
  }
  return { fullName: candidate.fullName, branch: candidate.branch };
}

export async function POST(request: Request) {
  try {
    assertSafeMutationRequest(request);
    const session = await requireGitHubSession();
    const body = parseCloneRequest(await request.json());
    const repository = await fetchGitHubRepository(session.accessToken, body.fullName);
    if (!repository.permissions.pull) {
      return sandboxJson({ error: "Repository cannot be cloned with the current GitHub access.", code: "repo_forbidden" }, { status: 403 });
    }

    const identity = await getOrCreateWorkspaceIdentity();
    const clone = await withSandboxMutationLock(identity.sandboxName, () =>
      getSandboxRuntime().cloneRepository(
        identity.sandboxName,
        repository,
        session.accessToken,
        { login: session.user.login, email: session.user.email },
        body.branch,
      ),
    );
    return sandboxJson({ clone });
  } catch (error) {
    return sandboxErrorResponse(error);
  }
}
