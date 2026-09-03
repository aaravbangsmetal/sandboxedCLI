import type { TerminalConnection } from "@/lib/sandbox/contracts";

import type { TerminalOutputHandler, TerminalTransport } from "./transport";

export type TerminalConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

export interface VercelTerminalTransportOptions {
  onStateChange?: (state: TerminalConnectionState) => void;
  onExit?: (code: number | null) => void;
  fetcher?: typeof fetch;
  websocketFactory?: (url: string) => WebSocket;
}

const MAX_BUFFERED_INPUT = 64 * 1024;
const RECONNECT_DELAYS = [500, 1_000, 2_000, 4_000] as const;

function parseExitFrame(data: string) {
  try {
    const message = JSON.parse(data) as { type?: unknown; code?: unknown };
    if (message.type !== "exit") return undefined;
    return typeof message.code === "number" ? message.code : null;
  } catch {
    return undefined;
  }
}

export class VercelTerminalTransport implements TerminalTransport {
  private readonly fetcher: typeof fetch;
  private readonly websocketFactory: (url: string) => WebSocket;
  private readonly onStateChange?: (state: TerminalConnectionState) => void;
  private readonly onExit?: (code: number | null) => void;
  private onOutput: TerminalOutputHandler | null = null;
  private socket: WebSocket | null = null;
  private disposed = false;
  private generation = 0;
  private reconnectAttempt = 0;
  private reconnectTimer: number | null = null;
  private inputQueue: Uint8Array[] = [];
  private queuedInputBytes = 0;
  private size = { cols: 80, rows: 24 };

  constructor(
    readonly terminalId: string,
    options: VercelTerminalTransportOptions = {},
  ) {
    this.fetcher = options.fetcher ?? fetch;
    this.websocketFactory = options.websocketFactory ?? ((url) => new WebSocket(url));
    this.onStateChange = options.onStateChange;
    this.onExit = options.onExit;
  }

  connect(onOutput: TerminalOutputHandler): void {
    this.onOutput = onOutput;
    this.disposed = false;
    void this.open(false);
  }

  write(data: string): void {
    const encoded = new TextEncoder().encode(data);
    if (this.socket?.readyState === 1) {
      this.socket.send(encoded);
      return;
    }
    if (this.queuedInputBytes + encoded.byteLength > MAX_BUFFERED_INPUT) return;
    this.inputQueue.push(encoded);
    this.queuedInputBytes += encoded.byteLength;
  }

  resize(cols: number, rows: number): void {
    this.size = {
      cols: Math.min(500, Math.max(20, Math.round(cols))),
      rows: Math.min(200, Math.max(5, Math.round(rows))),
    };
    if (this.socket?.readyState === 1) {
      this.socket.send(JSON.stringify({ type: "resize", ...this.size }));
    }
  }

  dispose(): void {
    this.disposed = true;
    this.generation += 1;
    this.clearReconnectTimer();
    this.socket?.close(1000, "terminal unmounted");
    this.socket = null;
    this.onOutput = null;
    this.inputQueue = [];
    this.queuedInputBytes = 0;
    this.onStateChange?.("disconnected");
  }

  private async open(reconnecting: boolean) {
    const generation = ++this.generation;
    this.onStateChange?.(reconnecting ? "reconnecting" : "connecting");

    try {
      const response = await this.fetcher("/api/sandbox/terminal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ terminalId: this.terminalId, ...this.size }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || `Terminal connection failed (${response.status}).`);
      }
      const connection = (await response.json()) as TerminalConnection;
      if (this.disposed || generation !== this.generation) return;

      const separator = connection.websocketUrl.includes("?") ? "&" : "?";
      const socket = this.websocketFactory(
        `${connection.websocketUrl}${separator}token=${encodeURIComponent(connection.websocketToken)}`,
      );
      socket.binaryType = "arraybuffer";
      this.socket = socket;

      socket.onopen = () => {
        if (this.disposed || generation !== this.generation) return socket.close();
        this.reconnectAttempt = 0;
        socket.send(JSON.stringify({ ...connection.start, ...this.size }));
        for (const chunk of this.inputQueue) socket.send(chunk);
        this.inputQueue = [];
        this.queuedInputBytes = 0;
        this.onStateChange?.("connected");
      };
      socket.onmessage = (event) => void this.handleMessage(event.data);
      socket.onerror = () => {
        if (generation === this.generation) this.onStateChange?.("error");
      };
      socket.onclose = (event) => {
        if (generation !== this.generation || this.disposed) return;
        this.socket = null;
        if (event.code === 1000) {
          this.onStateChange?.("disconnected");
          return;
        }
        this.scheduleReconnect();
      };
    } catch (error) {
      if (this.disposed || generation !== this.generation) return;
      this.onOutput?.(`\r\n\x1b[90m${error instanceof Error ? error.message : "Terminal connection failed."}\x1b[0m\r\n`);
      this.scheduleReconnect();
    }
  }

  private async handleMessage(data: unknown) {
    if (typeof data === "string") {
      const exitCode = parseExitFrame(data);
      if (exitCode !== undefined) {
        this.onExit?.(exitCode);
        return;
      }
      this.onOutput?.(data);
      return;
    }
    if (data instanceof ArrayBuffer) {
      this.onOutput?.(new TextDecoder().decode(data));
      return;
    }
    if (typeof Blob !== "undefined" && data instanceof Blob) {
      this.onOutput?.(new TextDecoder().decode(await data.arrayBuffer()));
    }
  }

  private scheduleReconnect() {
    this.clearReconnectTimer();
    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)];
    this.reconnectAttempt += 1;
    this.onStateChange?.("reconnecting");
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.disposed) void this.open(true);
    }, delay);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer === null) return;
    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }
}
