import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => database }));

vi.mock("server-only", () => ({}));

import { withSandboxMutationLock } from "./mutation-lock";

describe("withSandboxMutationLock", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it("runs mutations for the same sandbox one at a time", async () => {
    const order: string[] = [];
    const first = withSandboxMutationLock("sandbox-a", async () => {
      order.push("first-start");
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push("first-end");
    });
    const second = withSandboxMutationLock("sandbox-a", async () => {
      order.push("second");
    });

    await Promise.all([first, second]);
    expect(order).toEqual(["first-start", "first-end", "second"]);
  });

  it("releases the local queue when a mutation fails", async () => {
    const first = withSandboxMutationLock("sandbox-b", async () => { throw new Error("failed"); });
    const second = withSandboxMutationLock("sandbox-b", async () => "recovered");
    await expect(first).rejects.toThrow("failed");
    await expect(second).resolves.toBe("recovered");
  });

  it("holds the database lease longer than the route lifetime and releases only its holder", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const insert = vi.fn().mockResolvedValue({ error: null });
    const holderEq = vi.fn().mockResolvedValue({ error: null });
    const lt = vi.fn().mockResolvedValue({ error: null });
    const userEq = vi.fn().mockReturnValue({ lt, eq: holderEq });
    database.from.mockReturnValue({ insert, delete: () => ({ eq: userEq }) });
    const started = Date.now();
    await expect(withSandboxMutationLock("user-one", async () => "done")).resolves.toBe("done");
    const row = insert.mock.calls[0][0];
    expect(Date.parse(row.expires_at) - started).toBeGreaterThanOrEqual(600_000);
    expect(userEq).toHaveBeenCalledWith("user_id", "user-one");
    expect(holderEq).toHaveBeenCalledWith("holder", row.holder);
  });

  it("fails immediately on database errors instead of treating them as contention", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const lt = vi.fn().mockResolvedValue({ error: null });
    database.from.mockReturnValue({
      delete: () => ({ eq: () => ({ lt }) }),
      insert: vi.fn().mockResolvedValue({ error: { code: "42P01" } }),
    });
    const mutation = vi.fn();
    await expect(withSandboxMutationLock("user-one", mutation)).rejects.toThrow("Unable to acquire");
    expect(mutation).not.toHaveBeenCalled();
  });
});
