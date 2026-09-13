import "server-only";

function originFromValue(value: string) {
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    return url.origin;
  } catch {
    return null;
  }
}

export function publicOrigin(request: Request) {
  for (const value of [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
  ]) {
    if (!value) continue;
    const origin = originFromValue(value);
    if (origin) return origin;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_SITE_URL is required in production.");
  }
  return new URL(request.url).origin;
}
