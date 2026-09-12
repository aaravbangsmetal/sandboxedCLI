import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { publicOrigin } from "./public-origin";

describe("publicOrigin", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_URL;
  });

  it("prefers NEXT_PUBLIC_SITE_URL over the request URL", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://sandboxedcli.xyz";
    expect(publicOrigin(new Request("https://attacker.example/api/auth/github"))).toBe(
      "https://sandboxedcli.xyz",
    );
  });

  it("falls back to the request origin outside production", () => {
    expect(publicOrigin(new Request("https://localhost:3000/api/auth/github"))).toBe(
      "https://localhost:3000",
    );
  });
});
