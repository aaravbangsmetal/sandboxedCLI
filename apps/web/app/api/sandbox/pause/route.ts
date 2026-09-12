import { getOrCreateWorkspaceIdentity } from "@/lib/sandbox/identity";
import { sandboxErrorResponse, sandboxJson } from "@/lib/sandbox/http";
import { withSandboxMutationLock } from "@/lib/sandbox/mutation-lock";
import { assertRateLimit } from "@/lib/sandbox/rate-limit";
import { assertSafeMutationRequest } from "@/lib/sandbox/request-security";
import { getSandboxRuntime } from "@/lib/sandbox/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSafeMutationRequest(request);
    const identity = await getOrCreateWorkspaceIdentity();
    assertRateLimit(`${identity.id}:pause`, 20, 10 * 60_000);
    const result = await withSandboxMutationLock(identity.userId, () =>
      getSandboxRuntime().pause(identity.sandboxName),
    );
    return sandboxJson(result);
  } catch (error) {
    return sandboxErrorResponse(error);
  }
}
