import { sandboxConfig } from "@/lib/sandbox/config";
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
    const sandbox = await withSandboxMutationLock(identity.sandboxName, () =>
      getSandboxRuntime().extend(identity.sandboxName, sandboxConfig.leaseExtensionMs),
    );
    return sandboxJson({ sandbox });
  } catch (error) {
    return sandboxErrorResponse(error);
  }
}
