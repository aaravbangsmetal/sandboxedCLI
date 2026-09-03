import { clearWorkspaceIdentity, getOrCreateWorkspaceIdentity } from "@/lib/sandbox/identity";
import { sandboxErrorResponse, sandboxJson } from "@/lib/sandbox/http";
import { withSandboxMutationLock } from "@/lib/sandbox/mutation-lock";
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
    const sandbox = await withSandboxMutationLock(identity.sandboxName, () =>
      getSandboxRuntime().ensureRunning(identity.sandboxName),
    );
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
    await withSandboxMutationLock(identity.sandboxName, () =>
      getSandboxRuntime().destroy(identity.sandboxName),
    );
    await clearWorkspaceIdentity();
    return sandboxJson({ destroyed: true });
  } catch (error) {
    return sandboxErrorResponse(error);
  }
}
