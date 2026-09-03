import type { TerminalOutputHandler, TerminalTransport } from "./transport";

const PROMPT = "\r\n\x1b[30m>_\x1b[0m";

const COMMANDS: Record<string, readonly string[]> = {
  help: [
    "available commands: help, agents, pwd, clear, codex, claude, logout",
    "this interface is mocked; a live sandbox will be connected in the next phase.",
  ],
  agents: ["codex     ready", "claude    ready"],
  pwd: ["/workspace/sandboxedcli"],
  codex: [
    "\x1b[30m>_codex\x1b[90m v0.24.82\x1b[0m",
    "model:     cloud agent (mock)",
    "directory: /workspace/sandboxedcli",
  ],
  claude: [
    "\x1b[30m>_claude\x1b[90m interface preview\x1b[0m",
    "directory: /workspace/sandboxedcli",
  ],
};

export interface MockTerminalTransportOptions {
  onLogout?: () => void;
}

export class MockTerminalTransport implements TerminalTransport {
  private onOutput: TerminalOutputHandler | null = null;
  private input = "";
  private transcript = "";
  private hasConnected = false;
  private logoutTimer: number | null = null;
  private readonly onLogout?: () => void;

  constructor(options: MockTerminalTransportOptions = {}) {
    this.onLogout = options.onLogout;
  }

  connect(onOutput: TerminalOutputHandler): void {
    this.onOutput = onOutput;

    if (this.hasConnected) {
      onOutput("\x1b[2J\x1b[H" + this.transcript);
      return;
    }

    this.hasConnected = true;
    this.emit(
      "\x1b[30m>_sandboxed/cli\x1b[90m interface preview\x1b[0m\r\n" +
        "\x1b[90mtype help to view mock commands\x1b[0m" +
        PROMPT,
    );
  }

  write(data: string): void {
    for (const character of data) {
      if (character === "\r" || character === "\n") {
        this.runCommand(this.input.trim());
        this.input = "";
        continue;
      }

      if (character === "\u007f") {
        if (this.input.length > 0) {
          this.input = this.input.slice(0, -1);
          this.emit("\b \b");
        }
        continue;
      }

      if (character === "\u0003") {
        this.input = "";
        this.emit("^C" + PROMPT);
        continue;
      }

      if (character >= " " && character !== "\u007f") {
        this.input += character;
        this.emit(character);
      }
    }
  }

  resize(): void {
    // The mock has no remote PTY to resize. The method mirrors the live contract.
  }

  dispose(): void {
    this.onOutput = null;
    if (this.logoutTimer !== null) {
      window.clearTimeout(this.logoutTimer);
      this.logoutTimer = null;
    }
  }

  private runCommand(command: string): void {
    if (!command) {
      this.emit(PROMPT);
      return;
    }

    if (command === "clear") {
      this.transcript = "";
      this.emit("\x1b[2J\x1b[H\x1b[30m>_\x1b[0m", false);
      return;
    }

    if (command === "logout") {
      this.emit("\r\n\x1b[90mending interface session...\x1b[0m\r\n");
      this.logoutTimer = window.setTimeout(() => {
        this.logoutTimer = null;
        this.onLogout?.();
      }, 180);
      return;
    }

    const response = COMMANDS[command];
    if (response) {
      this.emit("\r\n" + response.join("\r\n") + PROMPT);
      return;
    }

    this.emit(
      `\r\n\x1b[90m${command}: unavailable until sandbox integration\x1b[0m${PROMPT}`,
    );
  }

  private emit(data: string, append = true): void {
    if (append) this.transcript += data;
    else this.transcript = data;
    this.onOutput?.(data);
  }
}
