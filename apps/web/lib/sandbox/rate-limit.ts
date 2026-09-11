import "server-only";

export class RateLimitError extends Error {
  constructor() {
    super("Too many requests. Try again shortly.");
    this.name = "RateLimitError";
  }
}

const windows = new Map<string, number[]>();

export function assertRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const recent = (windows.get(key) ?? []).filter((stamp) => now - stamp < windowMs);
  if (recent.length >= limit) throw new RateLimitError();
  recent.push(now);
  windows.set(key, recent);
}

export function resetRateLimitsForTests() {
  windows.clear();
}
