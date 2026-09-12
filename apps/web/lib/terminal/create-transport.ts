import { MockTerminalTransport } from "./mock-transport";
import type { TerminalTransport } from "./transport";
import {
  type TerminalConnectionState,
  VercelTerminalTransport,
} from "./vercel-transport";

export function createSandboxTerminalTransport(
  terminalId: string,
  options: {
    onLogout?: () => void;
    onStateChange?: (state: TerminalConnectionState) => void;
  } = {},
): TerminalTransport {
  if (process.env.NEXT_PUBLIC_SANDBOX_TRANSPORT === "mock") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Mock sandbox transport is not allowed in production.");
    }
    return new MockTerminalTransport({ onLogout: options.onLogout });
  }
  return new VercelTerminalTransport(terminalId, { onStateChange: options.onStateChange });
}
