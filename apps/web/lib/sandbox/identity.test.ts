import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

import { deriveSandboxName, parseWorkspaceCookie, serializeWorkspaceCookie } from "./identity";

const WORKSPACE_ID = "a".repeat(64);

describe("sandbox workspace identity", () => {
  beforeEach(() => {
    process.env.SANDBOX_SESSION_SECRET = "test-secret-at-least-local-only";
  });

  it("round-trips a signed workspace cookie", () => {
    const cookie = serializeWorkspaceCookie(WORKSPACE_ID);
    expect(parseWorkspaceCookie(cookie)).toBe(WORKSPACE_ID);
  });

  it("rejects tampered workspace cookies", () => {
    const cookie = serializeWorkspaceCookie(WORKSPACE_ID);
    expect(parseWorkspaceCookie(`${cookie.slice(0, -1)}0`)).toBeNull();
    expect(parseWorkspaceCookie("invalid.signature")).toBeNull();
  });

  it("derives a stable opaque provider name", () => {
    expect(deriveSandboxName(WORKSPACE_ID)).toMatch(/^sandboxed-cli-[a-f0-9]{40}$/);
    expect(deriveSandboxName(WORKSPACE_ID)).toBe(deriveSandboxName(WORKSPACE_ID));
    expect(deriveSandboxName("b".repeat(64))).not.toBe(deriveSandboxName(WORKSPACE_ID));
  });
});
