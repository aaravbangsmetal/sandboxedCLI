import { afterEach, describe, expect, it, vi } from "vitest";

import { MockTerminalTransport } from "./mock-transport";

describe("MockTerminalTransport", () => {
  afterEach(() => vi.useRealTimers());

  it.each([
    ["help", "available commands"],
    ["agents", "codex     ready"],
    ["pwd", "/workspace/sandboxedcli"],
    ["codex", ">_codex"],
    ["claude", ">_claude"],
  ])("runs the %s mock command", (command, expected) => {
    let output = "";
    const transport = new MockTerminalTransport();
    transport.connect((data) => (output += data));

    transport.write(`${command}\r`);

    expect(output).toContain(expected);
  });

  it("returns a restrained pending response for unknown commands", () => {
    let output = "";
    const transport = new MockTerminalTransport();
    transport.connect((data) => (output += data));
    transport.write("npm install\r");
    expect(output).toContain("unavailable until sandbox integration");
  });

  it("clears output and restores each transport transcript when reconnected", () => {
    let output = "";
    const transport = new MockTerminalTransport();
    transport.connect((data) => (output += data));
    transport.write("pwd\r");
    expect(output).toContain("/workspace/sandboxedcli");

    transport.write("clear\r");
    transport.dispose();
    output = "";
    transport.connect((data) => (output += data));

    expect(output).not.toContain("/workspace/sandboxedcli");
    expect(output).toContain(">_");
  });

  it("delays logout briefly", () => {
    vi.useFakeTimers();
    const onLogout = vi.fn();
    const onOutput = vi.fn();
    const transport = new MockTerminalTransport({ onLogout });
    transport.connect(onOutput);
    transport.write("logout\r");
    expect(onLogout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(180);
    expect(onLogout).toHaveBeenCalledOnce();

  });

  it("cancels pending logout and output when disposed", () => {
    vi.useFakeTimers();
    const onLogout = vi.fn();
    const onOutput = vi.fn();
    const transport = new MockTerminalTransport({ onLogout });
    transport.connect(onOutput);
    transport.write("logout\r");
    transport.dispose();
    transport.write("help\r");
    vi.runAllTimers();

    expect(onLogout).not.toHaveBeenCalled();
    expect(onOutput).not.toHaveBeenCalledWith(expect.stringContaining("available commands"));
  });
});
