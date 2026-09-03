import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { githubAuthConfig, githubSessionSecret } from "./config";

export interface GitHubSession {
  accessToken: string;
  scope: string;
  tokenType: string;
  user: {
    id: number;
    login: string;
    name: string | null;
    avatarUrl: string;
    htmlUrl: string;
    email: string | null;
  };
  createdAt: number;
  expiresAt: number;
}

interface SealedSessionPayload {
  version: 1;
  session: GitHubSession;
}

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

function sessionKey() {
  return createHash("sha256").update(githubSessionSecret()).digest();
}

function base64UrlEncode(value: Buffer) {
  return value.toString("base64url");
}

function base64UrlDecode(value: string) {
  if (!BASE64URL_PATTERN.test(value)) throw new Error("Invalid sealed session encoding.");
  return Buffer.from(value, "base64url");
}

function isGitHubSession(value: unknown): value is GitHubSession {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GitHubSession>;
  const user = candidate.user as Partial<GitHubSession["user"]> | undefined;
  return (
    typeof candidate.accessToken === "string" &&
    typeof candidate.scope === "string" &&
    typeof candidate.tokenType === "string" &&
    typeof candidate.createdAt === "number" &&
    typeof candidate.expiresAt === "number" &&
    !!user &&
    typeof user.id === "number" &&
    typeof user.login === "string" &&
    (typeof user.name === "string" || user.name === null) &&
    typeof user.avatarUrl === "string" &&
    typeof user.htmlUrl === "string"
  );
}

export function sealGitHubSession(session: GitHubSession) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sessionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify({ version: 1, session } satisfies SealedSessionPayload));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", base64UrlEncode(iv), base64UrlEncode(tag), base64UrlEncode(ciphertext)].join(".");
}

export function openGitHubSession(sealed: string | undefined, now = Date.now()) {
  if (!sealed) return null;
  const [version, encodedIv, encodedTag, encodedCiphertext, extra] = sealed.split(".");
  if (extra || version !== "v1") return null;

  try {
    const iv = base64UrlDecode(encodedIv);
    const tag = base64UrlDecode(encodedTag);
    const ciphertext = base64UrlDecode(encodedCiphertext);
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) return null;

    const decipher = createDecipheriv("aes-256-gcm", sessionKey(), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const payload = JSON.parse(plaintext.toString("utf8")) as Partial<SealedSessionPayload>;
    if (payload.version !== 1 || !isGitHubSession(payload.session)) return null;
    if (payload.session.expiresAt <= now) return null;
    return payload.session;
  } catch {
    return null;
  }
}

export async function getGitHubSession() {
  const cookieStore = await cookies();
  return openGitHubSession(cookieStore.get(githubAuthConfig.sessionCookieName)?.value);
}

export async function setGitHubSession(session: GitHubSession) {
  const cookieStore = await cookies();
  cookieStore.set(githubAuthConfig.sessionCookieName, sealGitHubSession(session), {
    httpOnly: true,
    maxAge: githubAuthConfig.sessionMaxAgeSeconds,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    priority: "high",
  });
}

export async function clearGitHubSession() {
  (await cookies()).delete(githubAuthConfig.sessionCookieName);
}

export function createOAuthState() {
  const verifier = randomBytes(32).toString("base64url");
  const signature = createHash("sha256").update(`${githubSessionSecret()}:${verifier}`).digest();
  return `${verifier}.${base64UrlEncode(signature)}`;
}

export function verifyOAuthState(value: string | undefined) {
  if (!value) return false;
  const [verifier, encodedSignature, extra] = value.split(".");
  if (extra || !verifier || !encodedSignature) return false;
  try {
    const expected = createHash("sha256").update(`${githubSessionSecret()}:${verifier}`).digest();
    const supplied = base64UrlDecode(encodedSignature);
    return expected.length === supplied.length && timingSafeEqual(expected, supplied);
  } catch {
    return false;
  }
}

export async function setOAuthStateCookie(state: string) {
  const cookieStore = await cookies();
  cookieStore.set(githubAuthConfig.stateCookieName, state, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    priority: "high",
  });
}

export async function consumeOAuthStateCookie() {
  const cookieStore = await cookies();
  const value = cookieStore.get(githubAuthConfig.stateCookieName)?.value;
  cookieStore.delete(githubAuthConfig.stateCookieName);
  return value;
}
