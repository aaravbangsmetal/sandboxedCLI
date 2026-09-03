import "server-only";

export class UnsafeSandboxRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeSandboxRequestError";
  }
}

export function assertSafeMutationRequest(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new UnsafeSandboxRequestError("Sandbox mutations require application/json.");
  }

  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) throw new UnsafeSandboxRequestError("A same-origin request is required.");

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new UnsafeSandboxRequestError("The request origin is invalid.");
  }

  if (originHost !== host) throw new UnsafeSandboxRequestError("Cross-origin sandbox mutation denied.");
}
