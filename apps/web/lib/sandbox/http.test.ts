import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({
  dropGitHubConnectionIfPresent: vi.fn(async () => undefined),
}));

import { GitHubApiError } from "@/lib/github/client";

import { sandboxErrorResponse } from "./http";

describe("sandboxErrorResponse", () => {
  it("maps GitHub authentication and rate-limit failures", async () => {
    const unauthorized = await sandboxErrorResponse(new GitHubApiError("Bad credentials", 401));
    expect(unauthorized.status).toBe(401);
    await expect(unauthorized.json()).resolves.toMatchObject({ code: "authentication_required" });

    const limited = await sandboxErrorResponse(new GitHubApiError("API rate limit exceeded", 429));
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toMatchObject({ code: "github_rate_limited" });
  });

  it("maps GitHub not-found and forbidden responses", async () => {
    const missing = await sandboxErrorResponse(new GitHubApiError("Not Found", 404));
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({ code: "github_not_found" });

    const forbidden = await sandboxErrorResponse(new GitHubApiError("Resource not accessible", 403));
    expect(forbidden.status).toBe(403);
    await expect(forbidden.json()).resolves.toMatchObject({ code: "github_forbidden" });

    const expired = await sandboxErrorResponse(new GitHubApiError("Bad credentials", 403));
    expect(expired.status).toBe(401);
    await expect(expired.json()).resolves.toMatchObject({ code: "authentication_required" });
  });
});
