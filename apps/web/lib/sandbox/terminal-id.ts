import { InvalidTerminalIdError } from "./errors";

const TERMINAL_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function validateTerminalId(terminalId: string) {
  if (!TERMINAL_ID_PATTERN.test(terminalId)) throw new InvalidTerminalIdError();
  return terminalId;
}

export function tmuxSessionName(terminalId: string) {
  return `sc-${validateTerminalId(terminalId)}`;
}
