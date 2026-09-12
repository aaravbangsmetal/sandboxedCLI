import { clearSandboxFirstStarted, markSandboxFirstStarted } from "@/lib/auth/github-connection";
import { sandboxConfig } from "@/lib/sandbox/config";
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
    assertRateLimit(`${identity.id}:extend`, 20, 10 * 60_000);
    const firstStartedAtMs = await markSandboxFirstStarted(identity.userId);
    const sandbox = await withSandboxMutationLock(identity.sandboxName, () =>
      getSandboxRuntime().extend(identity.sandboxName, sandboxConfig.leaseExtensionMs, firstStartedAtMs),
    );
    return sandboxJson({ sandbox });
  } catch (error) {
    return sandboxErrorResponse(error);
  }
}
