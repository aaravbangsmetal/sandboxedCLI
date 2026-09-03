import { afterEach, describe, expect, it, vi } from "vitest";

import type { TerminalConnection } from "@/lib/sandbox/contracts";

import { VercelTerminalTransport } from "./vercel-transport";

class FakeSocket {
  readyState = 0;
  binaryType = "blob";
  sent: unknown[] = [];
  onopen: ((event: Event) => unknown) | null = null;
  onmessage: ((event: MessageEvent) => unknown) | null = null;
  onerror: ((event: Event) => unknown) | null = null;
  onclose: ((event: CloseEvent) => unknown) | null = null;

  send(data: unknown) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
  }

  open() {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }

  message(data: string | ArrayBuffer) {
    this.onmessage?.(new MessageEvent("message", { data }));
  }

  disconnect() {
    this.readyState = 3;
    this.onclose?.(new CloseEvent("close", { code: 1006 }));
  }
}

const connection: TerminalConnection = {
  sandbox: {
    name: "sandboxed-cli-test",
    state: "running",
    persistent: true,
    filesystemPreserved: true,
    processMemoryPreserved: false,
  },
  terminalId: "terminal-one",
  connectionId: "connection-one",
  websocketUrl: "wss://controller.example/terminal",
  websocketToken: "secret token",
  start: {
    type: "start",
    command: "tmux",
    args: ["new-session", "-A", "-s", "sc-terminal-one"],
    env: ["TERM=xterm-256color"],
    cwd: "/vercel/sandbox",
    cols: 80,
    rows: 24,
  },
};

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function connectionResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => connection,
  } as Response;
}

describe("VercelTerminalTransport", () => {
  afterEach(() => vi.useRealTimers());

  it("starts a PTY, forwards binary IO, and resizes it", async () => {
    const sockets: FakeSocket[] = [];
    const fetcher = vi.fn(async () => connectionResponse());
    const output = vi.fn();
    const transport = new VercelTerminalTransport("terminal-one", {
      fetcher: fetcher as typeof fetch,
      websocketFactory: (url) => {
        expect(url).toBe("wss://controller.example/terminal?token=secret%20token");
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket as unknown as WebSocket;
      },
    });

    transport.resize(120, 40);
    transport.write("queued");
    transport.connect(output);
    await flushPromises();
    sockets[0].open();

    expect(JSON.parse(sockets[0].sent[0] as string)).toMatchObject({ type: "start", cols: 120, rows: 40 });
    expect(new TextDecoder().decode(sockets[0].sent[1] as Uint8Array)).toBe("queued");
    transport.resize(100, 30);
    expect(JSON.parse(sockets[0].sent[2] as string)).toEqual({ type: "resize", cols: 100, rows: 30 });

    const terminalBytes = new window.ArrayBuffer(5);
    new Uint8Array(terminalBytes).set([104, 101, 108, 108, 111]);
    sockets[0].message(terminalBytes);
    expect(output).toHaveBeenCalledWith("hello");
    transport.dispose();
  });

  it("requests a fresh credential before reconnecting", async () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const fetcher = vi.fn(async () => connectionResponse());
    const transport = new VercelTerminalTransport("terminal-one", {
      fetcher: fetcher as typeof fetch,
      websocketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket as unknown as WebSocket;
      },
    });

    transport.connect(() => undefined);
    await flushPromises();
    sockets[0].open();
    sockets[0].disconnect();
    await vi.advanceTimersByTimeAsync(500);
    await flushPromises();

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sockets).toHaveLength(2);
    transport.dispose();
  });

  it("reports an exit frame without printing control JSON", async () => {
    const socket = new FakeSocket();
    const output = vi.fn();
    const onExit = vi.fn();
    const transport = new VercelTerminalTransport("terminal-one", {
      fetcher: (async () => connectionResponse()) as typeof fetch,
      websocketFactory: () => socket as unknown as WebSocket,
      onExit,
    });

    transport.connect(output);
    await flushPromises();
    socket.open();
    socket.message(JSON.stringify({ type: "exit", code: 0 }));

    expect(onExit).toHaveBeenCalledWith(0);
    expect(output).not.toHaveBeenCalled();
    transport.dispose();
  });
});
