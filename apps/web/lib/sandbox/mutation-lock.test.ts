import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { withSandboxMutationLock } from "./mutation-lock";

describe("withSandboxMutationLock", () => {
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
});
