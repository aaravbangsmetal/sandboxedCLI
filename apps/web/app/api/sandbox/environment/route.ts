import { getOrCreateWorkspaceIdentity } from "@/lib/sandbox/identity";
import { sandboxErrorResponse, sandboxJson } from "@/lib/sandbox/http";
import { withSandboxMutationLock } from "@/lib/sandbox/mutation-lock";
import { assertSafeMutationRequest } from "@/lib/sandbox/request-security";
import { getSandboxRuntime } from "@/lib/sandbox/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSafeMutationRequest(request);
    const identity = await getOrCreateWorkspaceIdentity();
    const sandboxRuntime = getSandboxRuntime();
    const environment = await withSandboxMutationLock(identity.sandboxName, async () => {
      await sandboxRuntime.ensureRunning(identity.sandboxName);
      return sandboxRuntime.checkEnvironment(identity.sandboxName);
    });
    return sandboxJson({ configured: true, environment });
  } catch (error) {
    return sandboxErrorResponse(error);
  }
}
