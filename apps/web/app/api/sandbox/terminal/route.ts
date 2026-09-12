import { getOrCreateWorkspaceIdentity, getWorkspaceIdentity } from "@/lib/sandbox/identity";
import { requireGitHubSession } from "@/lib/auth/require-session";
import { sandboxErrorResponse, sandboxJson } from "@/lib/sandbox/http";
import { withSandboxMutationLock } from "@/lib/sandbox/mutation-lock";
import { assertRateLimit } from "@/lib/sandbox/rate-limit";
import { assertSafeMutationRequest } from "@/lib/sandbox/request-security";
import { getSandboxRuntime } from "@/lib/sandbox/runtime";
import { validateTerminalId } from "@/lib/sandbox/terminal-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function terminalSize(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === "number" && Number.isInteger(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

export async function POST(request: Request) {
  try {
    assertSafeMutationRequest(request);
    const body = (await request.json()) as { terminalId?: unknown; cols?: unknown; rows?: unknown };
    const terminalId = validateTerminalId(typeof body.terminalId === "string" ? body.terminalId : "");
    const session = await requireGitHubSession();
    assertRateLimit(`${session.account.id}:terminal`, 30, 10 * 60_000);
    const identity = await getOrCreateWorkspaceIdentity();
    const connection = await withSandboxMutationLock(identity.userId, () =>
      getSandboxRuntime().openTerminal(
        identity.sandboxName,
        terminalId,
        {
          cols: terminalSize(body.cols, 80, 20, 500),
          rows: terminalSize(body.rows, 24, 5, 200),
        },
        session.accessToken,
      ),
    );
    return sandboxJson(connection);
  } catch (error) {
    return sandboxErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSafeMutationRequest(request);
    const body = (await request.json()) as { terminalId?: unknown };
    const terminalId = validateTerminalId(typeof body.terminalId === "string" ? body.terminalId : "");
    await requireGitHubSession();
    const identity = await getWorkspaceIdentity();
    await withSandboxMutationLock(identity.userId, () =>
      getSandboxRuntime().killTerminal(identity.sandboxName, terminalId),
    );
    return sandboxJson({ terminated: true });
  } catch (error) {
    return sandboxErrorResponse(error);
  }
}
