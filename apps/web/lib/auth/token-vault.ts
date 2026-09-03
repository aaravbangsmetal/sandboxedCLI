import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

function encryptionKey() {
  const secret = process.env.GITHUB_TOKEN_ENCRYPTION_KEY || process.env.GITHUB_SESSION_SECRET;
  if (!secret) throw new Error("GITHUB_TOKEN_ENCRYPTION_KEY is required.");
  return createHash("sha256").update(secret).digest();
}

function decode(value: string) {
  if (!BASE64URL_PATTERN.test(value)) throw new Error("Invalid encrypted token encoding.");
  return Buffer.from(value, "base64url");
}

export function encryptProviderToken(accessToken: string) {
  if (!accessToken) throw new Error("A GitHub provider token is required.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(accessToken, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptProviderToken(value: string) {
  const [version, encodedIv, encodedTag, encodedCiphertext, extra] = value.split(".");
  if (extra || version !== "v1") throw new Error("Unsupported encrypted token version.");
  const iv = decode(encodedIv);
  const tag = decode(encodedTag);
  const ciphertext = decode(encodedCiphertext);
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
    throw new Error("Invalid encrypted token payload.");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
