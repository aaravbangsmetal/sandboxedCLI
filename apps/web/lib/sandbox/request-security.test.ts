import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { assertSafeMutationRequest, UnsafeSandboxRequestError } from "./request-security";

function request(headers: Record<string, string>) {
  return new Request("https://sandboxedcli.xyz/api/sandbox", { method: "POST", headers });
}

describe("sandbox mutation security", () => {
  it("accepts same-origin JSON mutations", () => {
    expect(() =>
      assertSafeMutationRequest(
        request({
          "content-type": "application/json",
          host: "sandboxedcli.xyz",
          origin: "https://sandboxedcli.xyz",
        }),
      ),
    ).not.toThrow();
  });

  it("rejects cross-origin and non-JSON mutations", () => {
    expect(() =>
      assertSafeMutationRequest(
        request({
          "content-type": "application/json",
          host: "sandboxedcli.xyz",
          origin: "https://attacker.example",
        }),
      ),
    ).toThrow(UnsafeSandboxRequestError);
    expect(() =>
      assertSafeMutationRequest(
        request({ host: "sandboxedcli.xyz", origin: "https://sandboxedcli.xyz" }),
      ),
    ).toThrow(UnsafeSandboxRequestError);
  });

  it("ignores a spoofed forwarded host", () => {
    expect(() =>
      assertSafeMutationRequest(
        request({
          "content-type": "application/json",
          host: "sandboxedcli.xyz",
          "x-forwarded-host": "attacker.example",
          origin: "https://attacker.example",
        }),
      ),
    ).toThrow(UnsafeSandboxRequestError);
  });
});
