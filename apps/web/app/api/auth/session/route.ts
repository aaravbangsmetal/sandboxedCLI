import { clearGitHubSession, getGitHubSession } from "@/lib/auth/session";
import { assertSafeMutationRequest } from "@/lib/sandbox/request-security";
import { sandboxErrorResponse, sandboxJson } from "@/lib/sandbox/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getGitHubSession();
    return sandboxJson({
      authenticated: Boolean(session),
      user: session?.user ?? null,
      scope: session?.scope ?? "",
    });
  } catch (error) {
    return sandboxErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSafeMutationRequest(request);
    await clearGitHubSession();
    return sandboxJson({ authenticated: false });
  } catch (error) {
    return sandboxErrorResponse(error);
  }
}
