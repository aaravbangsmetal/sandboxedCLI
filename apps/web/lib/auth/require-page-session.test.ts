import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ getSession: vi.fn(), redirect: vi.fn() }));
vi.mock("./session", () => ({ getGitHubSession: auth.getSession }));
vi.mock("next/navigation", () => ({ redirect: auth.redirect }));
import { requireGitHubPageSession } from "./require-page-session";

describe("page authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.getSession.mockResolvedValue(null);
    auth.redirect.mockImplementation(() => { throw new Error("redirected"); });
    vi.stubEnv("SANDBOX_E2E_TEST_MODE", "1");
    vi.stubEnv("NEXT_PUBLIC_SANDBOX_TRANSPORT", "mock");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("allows explicit development-only browser mocks", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await expect(requireGitHubPageSession()).resolves.toBeUndefined();
    expect(auth.getSession).not.toHaveBeenCalled();
  });

  it("enforces authentication in production even with test flags", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(requireGitHubPageSession()).rejects.toThrow("redirected");
    expect(auth.redirect).toHaveBeenCalledWith("/auth");
  });

  it("enforces authentication for real development terminals", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SANDBOX_TRANSPORT", "vercel");
    await expect(requireGitHubPageSession()).rejects.toThrow("redirected");
  });
});
