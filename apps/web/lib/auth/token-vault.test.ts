import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { decryptProviderToken, encryptProviderToken } from "./token-vault";

describe("GitHub provider token vault", () => {
  beforeEach(() => {
    process.env.GITHUB_TOKEN_ENCRYPTION_KEY = "test-only-provider-token-encryption-key";
  });

  afterEach(() => {
    delete process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
  });

  it("round-trips without exposing the token", () => {
    const encrypted = encryptProviderToken("gho_secret-token");
    expect(encrypted).not.toContain("gho_secret-token");
    expect(decryptProviderToken(encrypted)).toBe("gho_secret-token");
  });

  it("rejects tampered ciphertext", () => {
    const encrypted = encryptProviderToken("gho_secret-token");
    const parts = encrypted.split(".");
    const ciphertext = Buffer.from(parts[3], "base64url");
    ciphertext[0] ^= 1;
    parts[3] = ciphertext.toString("base64url");
    expect(() => decryptProviderToken(parts.join("."))).toThrow();
  });

  it("requires an encryption secret", () => {
    delete process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
    delete process.env.GITHUB_SESSION_SECRET;
    expect(() => encryptProviderToken("gho_secret-token")).toThrow(
      "GITHUB_TOKEN_ENCRYPTION_KEY is required.",
    );
  });
});
