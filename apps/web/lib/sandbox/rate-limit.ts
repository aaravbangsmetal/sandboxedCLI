import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export class RateLimitError extends Error {
  constructor() {
    super("Too many requests. Try again shortly.");
    this.name = "RateLimitError";
  }
}

const windows = new Map<string, { stamps: number[]; expiresAt: number }>();
let lastCleanup = 0;

export async function assertRateLimit(userId: string, action: string, limit: number, windowMs: number) {
  if (process.env.NODE_ENV === "production") {
    const { data, error } = await createSupabaseAdminClient().rpc("consume_sandbox_rate_limit", {
      p_user_id: userId,
      p_action: action,
      p_limit: limit,
      p_window_ms: windowMs,
    });
    if (error || typeof data !== "boolean") {
      throw new Error("Unable to check sandbox rate limit.", { cause: error });
    }
    if (!data) throw new RateLimitError();
    return;
  }

  const key = `${userId}:${action}`;
  const now = Date.now();
  if (now - lastCleanup >= 60_000) {
    for (const [entryKey, window] of windows) {
      if (window.expiresAt <= now) windows.delete(entryKey);
    }
    lastCleanup = now;
  }
  const recent = (windows.get(key)?.stamps ?? []).filter((stamp) => now - stamp < windowMs);
  if (recent.length >= limit) throw new RateLimitError();
  recent.push(now);
  windows.set(key, { stamps: recent, expiresAt: now + windowMs });
}

export function resetRateLimitsForTests() {
  if (process.env.NODE_ENV !== "test") throw new Error("Rate limit reset is test-only.");
  windows.clear();
  lastCleanup = 0;
}
