import { requireGitHubSession } from "@/lib/auth/require-session";
import { createGitHubPullRequest } from "@/lib/github/client";
import { getOrCreateWorkspaceIdentity } from "@/lib/sandbox/identity";
import { sandboxErrorResponse, sandboxJson } from "@/lib/sandbox/http";
import { withSandboxMutationLock } from "@/lib/sandbox/mutation-lock";
import { assertSafeMutationRequest } from "@/lib/sandbox/request-security";
import { getSandboxRuntime } from "@/lib/sandbox/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slugSuffix() {
  return Math.random().toString(36).slice(2, 10);
}

function parsePullRequestRequest(body: unknown) {
  if (!body || typeof body !== "object") throw new SyntaxError("Pull request requests require JSON.");
  const candidate = body as { title?: unknown; body?: unknown; branch?: unknown };
  if (typeof candidate.title !== "string" || candidate.title.trim().length === 0) {
    throw new SyntaxError("Pull request title is required.");
  }
  return {
    title: candidate.title.trim().slice(0, 120),
    body: typeof candidate.body === "string" ? candidate.body.slice(0, 10_000) : "",
    branch:
      typeof candidate.branch === "string" && candidate.branch.trim()
        ? candidate.branch.trim()
        : `sandboxedcli/change-${slugSuffix()}`,
  };
}

export async function POST(request: Request) {
  try {
    assertSafeMutationRequest(request);
    const session = await requireGitHubSession();
    const input = parsePullRequestRequest(await request.json());
    const identity = await getOrCreateWorkspaceIdentity();
    const pushed = await withSandboxMutationLock(identity.sandboxName, () =>
      getSandboxRuntime().commitAndPushActiveRepository(identity.sandboxName, session.accessToken, {
        branch: input.branch,
        message: input.title,
      }),
    );
    const pullRequest = await createGitHubPullRequest(session.accessToken, pushed.fullName, {
      title: input.title,
      body:
        input.body ||
        [
          "Created from sandboxed/cli.",
          "",
          `Sandbox commit: ${pushed.commitSha}`,
        ].join("\n"),
      head: pushed.branch,
      base: pushed.baseBranch,
    });
    return sandboxJson({ pushed, pullRequest });
  } catch (error) {
    return sandboxErrorResponse(error);
  }
}
