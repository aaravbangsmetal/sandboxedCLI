import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { deriveSandboxName, deriveUserWorkspaceId } from "./identity";

const WORKSPACE_ID = "a".repeat(64);

describe("sandbox workspace identity", () => {
  beforeEach(() => {
    process.env.SANDBOX_SESSION_SECRET = "test-secret-at-least-local-only";
  });

  it("derives a stable opaque provider name", () => {
    expect(deriveSandboxName(WORKSPACE_ID)).toMatch(/^sandboxed-cli-[a-f0-9]{40}$/);
    expect(deriveSandboxName(WORKSPACE_ID)).toBe(deriveSandboxName(WORKSPACE_ID));
    expect(deriveSandboxName("b".repeat(64))).not.toBe(deriveSandboxName(WORKSPACE_ID));
  });

  it("binds a stable opaque workspace to a Supabase user", () => {
    const workspaceId = deriveUserWorkspaceId("3af86e58-14a1-49c1-9275-2d22f976c8b1");
    expect(workspaceId).toMatch(/^[a-f0-9]{64}$/);
    expect(deriveUserWorkspaceId("3af86e58-14a1-49c1-9275-2d22f976c8b1")).toBe(workspaceId);
    expect(deriveUserWorkspaceId("another-user")).not.toBe(workspaceId);
  });
});
