import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { assertRateLimit, RateLimitError, resetRateLimitsForTests } from "./rate-limit";

describe("assertRateLimit", () => {
  it("allows bursts under the limit and then rejects", () => {
    resetRateLimitsForTests();
    assertRateLimit("user:clone", 2, 60_000);
    assertRateLimit("user:clone", 2, 60_000);
    expect(() => assertRateLimit("user:clone", 2, 60_000)).toThrow(RateLimitError);
  });
});
