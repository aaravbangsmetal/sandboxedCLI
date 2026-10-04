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

  it("reports connection state transitions for workspace UI", async () => {
    const socket = new FakeSocket();
    const onStateChange = vi.fn();
    const transport = new VercelTerminalTransport("terminal-one", {
      fetcher: (async () => connectionResponse()) as typeof fetch,
      websocketFactory: () => socket as unknown as WebSocket,
      onStateChange,
    });

    transport.connect(() => undefined);
    await flushPromises();
    socket.open();
    transport.dispose();

    expect(onStateChange.mock.calls.map(([state]) => state)).toEqual([
      "connecting",
      "connected",
      "disconnected",
    ]);
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

  it("single-flights overlapping connect attempts", async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    const fetcher = vi.fn(
      async () =>
        await new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const transport = new VercelTerminalTransport("terminal-one", {
      fetcher: fetcher as typeof fetch,
      websocketFactory: () => new FakeSocket() as unknown as WebSocket,
    });

    transport.connect(() => undefined);
    transport.connect(() => undefined);
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolveFetch?.(connectionResponse());
    await flushPromises();
    transport.dispose();
  });

  it("keeps Unicode characters intact when bytes span WebSocket frames", async () => {
    const socket = new FakeSocket();
    const output = vi.fn();
    const transport = new VercelTerminalTransport("terminal-one", {
      fetcher: (async () => connectionResponse()) as typeof fetch,
      websocketFactory: () => socket as unknown as WebSocket,
    });
    transport.connect(output);
    await flushPromises();
    socket.open();
    const bytes = new TextEncoder().encode("ह🙂");
    for (const byte of bytes) {
      const frame = new window.ArrayBuffer(1);
      new Uint8Array(frame)[0] = byte;
      socket.message(frame);
    }
    expect(output.mock.calls.map(([value]) => value).join("")).toBe("ह🙂");
    transport.dispose();
  });

  it.each([401, 403, 429])("does not retry a terminal request denied with HTTP %s", async (status) => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => ({ ok: false, status, json: async () => ({ error: "denied" }) }) as Response);
    const onStateChange = vi.fn();
    const transport = new VercelTerminalTransport("terminal-one", { fetcher: fetcher as typeof fetch, onStateChange });
    transport.connect(() => undefined);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(onStateChange).toHaveBeenLastCalledWith("error");
    transport.dispose();
  });

  it("can reconnect after disposal while a previous credential request is pending", async () => {
    let resolveFirst!: (value: Response) => void;
    const fetcher = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValue(connectionResponse());
    const sockets: FakeSocket[] = [];
    const output = vi.fn();
    const transport = new VercelTerminalTransport("terminal-one", {
      fetcher: fetcher as typeof fetch,
      websocketFactory: () => { const socket = new FakeSocket(); sockets.push(socket); return socket as unknown as WebSocket; },
    });
    transport.connect(output);
    const firstSignal = fetcher.mock.calls[0][1].signal as AbortSignal;
    transport.dispose();
    expect(firstSignal.aborted).toBe(true);
    transport.connect(output);
    await flushPromises();
    resolveFirst(connectionResponse());
    await flushPromises();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sockets).toHaveLength(1);
    sockets[0].open();
    transport.connect(output);
    expect(fetcher).toHaveBeenCalledTimes(2);
    transport.dispose();
    sockets[0].message("stale output");
    expect(output).not.toHaveBeenCalled();
  });

  it("retries a stalled WebSocket handshake after its deadline", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => connectionResponse());
    const transport = new VercelTerminalTransport("terminal-one", {
      fetcher: fetcher as typeof fetch,
      websocketFactory: () => new FakeSocket() as unknown as WebSocket,
    });
    transport.connect(() => undefined);
    await flushPromises();
    await vi.advanceTimersByTimeAsync(60_500);
    expect(fetcher).toHaveBeenCalledTimes(2);
    transport.dispose();
  });
});
