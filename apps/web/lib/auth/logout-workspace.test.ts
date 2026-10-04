import { describe, expect, it, vi } from "vitest";
import { logoutWorkspace } from "./logout-workspace";

describe("workspace logout", () => {
  it("waits for pause before clearing credentials", async () => {
    let finishPause!: (response: Response) => void;
    const fetcher = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { finishPause = resolve; }))
      .mockResolvedValueOnce(new Response("{}"));
    const operation = logoutWorkspace(fetcher as typeof fetch);
    expect(fetcher).toHaveBeenCalledTimes(1);
    finishPause(new Response("{}"));
    await expect(operation).resolves.toEqual({ pauseFailed: false });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/sandbox/pause", "/api/auth/session"]);
  });

  it("still signs out after a pause failure and reports it", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(new Response("{}"));
    await expect(logoutWorkspace(fetcher as typeof fetch)).resolves.toEqual({ pauseFailed: true });
  });

  it("reports sign-out failures instead of pretending the session was cleared", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("{}"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "session cleanup failed" }), { status: 500 }));
    await expect(logoutWorkspace(fetcher as typeof fetch)).rejects.toThrow("session cleanup failed");
  });
});
