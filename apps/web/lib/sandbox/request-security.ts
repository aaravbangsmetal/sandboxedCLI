import "server-only";

export class UnsafeSandboxRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeSandboxRequestError";
  }
}

function hostFromUrl(value: string) {
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).host.toLowerCase();
  } catch {
    return null;
  }
}

function configuredHosts() {
  const hosts = new Set<string>();
  for (const value of [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
  ]) {
    if (!value) continue;
    const host = hostFromUrl(value);
    if (host) hosts.add(host);
  }
  return hosts;
}

export function assertSafeMutationRequest(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new UnsafeSandboxRequestError("Sandbox mutations require application/json.");
  }

  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) throw new UnsafeSandboxRequestError("A same-origin request is required.");

  const originHost = hostFromUrl(origin);
  if (!originHost) throw new UnsafeSandboxRequestError("The request origin is invalid.");

  const allowed = configuredHosts();
  allowed.add(host.toLowerCase());
  if (!allowed.has(originHost)) throw new UnsafeSandboxRequestError("Cross-origin sandbox mutation denied.");
}
