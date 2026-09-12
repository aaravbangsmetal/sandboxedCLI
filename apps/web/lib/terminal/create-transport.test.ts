import { afterEach, describe, expect, it, vi } from "vitest";

import { MockTerminalTransport } from "./mock-transport";
import { createSandboxTerminalTransport } from "./create-transport";
import { VercelTerminalTransport } from "./vercel-transport";

describe("createSandboxTerminalTransport", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the Vercel transport by default", () => {
    expect(createSandboxTerminalTransport("terminal-one")).toBeInstanceOf(VercelTerminalTransport);
  });

  it("refuses the mock transport in production", () => {
    vi.stubEnv("NEXT_PUBLIC_SANDBOX_TRANSPORT", "mock");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => createSandboxTerminalTransport("terminal-one")).toThrow(/not allowed in production/);
  });

  it("allows the mock transport outside production", () => {
    vi.stubEnv("NEXT_PUBLIC_SANDBOX_TRANSPORT", "mock");
    expect(createSandboxTerminalTransport("terminal-one")).toBeInstanceOf(MockTerminalTransport);
  });
});
