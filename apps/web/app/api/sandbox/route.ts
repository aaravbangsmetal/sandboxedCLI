import { clearSandboxFirstStarted, markSandboxFirstStarted } from "@/lib/auth/github-connection";
import { getOrCreateWorkspaceIdentity } from "@/lib/sandbox/identity";
import { sandboxErrorResponse, sandboxJson } from "@/lib/sandbox/http";
import { withSandboxMutationLock } from "@/lib/sandbox/mutation-lock";
import { assertRateLimit } from "@/lib/sandbox/rate-limit";
import { assertSafeMutationRequest } from "@/lib/sandbox/request-security";
import { getSandboxRuntime } from "@/lib/sandbox/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const identity = await getOrCreateWorkspaceIdentity();
    const sandboxRuntime = getSandboxRuntime();
    if (!sandboxRuntime.isConfigured()) {
      return sandboxJson({
        configured: false,
        sandbox: {
          name: identity.sandboxName,
          state: "absent",
          persistent: true,
          filesystemPreserved: false,
          processMemoryPreserved: false,
        },
      });
    }
    return sandboxJson({ configured: true, sandbox: await sandboxRuntime.getStatus(identity.sandboxName) });
  } catch (error) {
    return sandboxErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSafeMutationRequest(request);
    const identity = await getOrCreateWorkspaceIdentity();
    assertRateLimit(`${identity.id}:start`, 20, 10 * 60_000);
    const sandbox = await withSandboxMutationLock(identity.userId, async () => {
      const status = await getSandboxRuntime().ensureRunning(identity.sandboxName);
      await markSandboxFirstStarted(identity.userId);
      return status;
    });
    return sandboxJson({ configured: true, sandbox });
  } catch (error) {
    return sandboxErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSafeMutationRequest(request);
    const body = (await request.json()) as { confirm?: unknown };
    if (body.confirm !== "destroy") {
      return sandboxJson(
        { error: 'Permanent deletion requires confirm: "destroy".', code: "confirmation_required" },
        { status: 400 },
      );
    }
    const identity = await getOrCreateWorkspaceIdentity();
    assertRateLimit(`${identity.id}:destroy`, 8, 10 * 60_000);
    await withSandboxMutationLock(identity.userId, async () => {
      await getSandboxRuntime().destroy(identity.sandboxName);
      await clearSandboxFirstStarted(identity.userId);
    });
    return sandboxJson({ destroyed: true });
  } catch (error) {
    return sandboxErrorResponse(error);
  }
}
