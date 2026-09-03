export type TerminalOutputHandler = (data: string) => void;

export interface TerminalTransport {
  connect(onOutput: TerminalOutputHandler): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  dispose(): void;
}

