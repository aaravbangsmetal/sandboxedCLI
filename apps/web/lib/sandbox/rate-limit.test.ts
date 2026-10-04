import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => database }));

vi.mock("server-only", () => ({}));

import { assertRateLimit, RateLimitError, resetRateLimitsForTests } from "./rate-limit";

describe("assertRateLimit", () => {
  beforeEach(() => { vi.clearAllMocks(); resetRateLimitsForTests(); });
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

  it("allows bursts under the limit and then rejects", async () => {
    resetRateLimitsForTests();
    await assertRateLimit("user", "clone", 2, 60_000);
    await assertRateLimit("user", "clone", 2, 60_000);
    await expect(assertRateLimit("user", "clone", 2, 60_000)).rejects.toThrow(RateLimitError);
  });

  it("expires the window without sharing quotas between users or actions", async () => {
    vi.useFakeTimers();
    await assertRateLimit("user", "clone", 1, 60_000);
    await assertRateLimit("other-user", "clone", 1, 60_000);
    await assertRateLimit("user", "pr", 1, 60_000);
    vi.advanceTimersByTime(60_000);
    await expect(assertRateLimit("user", "clone", 1, 60_000)).resolves.toBeUndefined();
  });

  it("uses the shared database quota in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    database.rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: false, error: null });
    await assertRateLimit("user", "clone", 8, 600_000);
    await expect(assertRateLimit("user", "clone", 8, 600_000)).rejects.toThrow(RateLimitError);
    expect(database.rpc).toHaveBeenCalledWith("consume_sandbox_rate_limit", {
      p_user_id: "user", p_action: "clone", p_limit: 8, p_window_ms: 600_000,
    });
  });

  it("fails closed when shared quota storage is unavailable", async () => {
    vi.stubEnv("NODE_ENV", "production");
    database.rpc.mockResolvedValue({ data: null, error: { message: "offline" } });
    await expect(assertRateLimit("user", "clone", 8, 600_000)).rejects.toThrow("Unable to check");
  });
});
