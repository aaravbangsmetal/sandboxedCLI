import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "sandboxedcli_workspace";
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const WORKSPACE_ID_PATTERN = /^[a-f0-9]{64}$/;

export interface WorkspaceIdentity {
  id: string;
  sandboxName: string;
}

function sessionSecret() {
  const configured = process.env.SANDBOX_SESSION_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production") return "sandboxed-cli-local-development-only";
  throw new Error("SANDBOX_SESSION_SECRET is required in production.");
}

function signature(workspaceId: string) {
  return createHmac("sha256", sessionSecret()).update(workspaceId).digest("hex");
}

export function serializeWorkspaceCookie(workspaceId: string) {
  if (!WORKSPACE_ID_PATTERN.test(workspaceId)) throw new Error("Invalid workspace ID.");
  return `${workspaceId}.${signature(workspaceId)}`;
}

export function parseWorkspaceCookie(value: string | undefined) {
  if (!value) return null;
  const [workspaceId, suppliedSignature, extra] = value.split(".");
  if (extra || !WORKSPACE_ID_PATTERN.test(workspaceId) || !suppliedSignature) return null;

  const expected = Buffer.from(signature(workspaceId), "hex");
  const supplied = Buffer.from(suppliedSignature, "hex");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  return workspaceId;
}

export function deriveSandboxName(workspaceId: string) {
  if (!WORKSPACE_ID_PATTERN.test(workspaceId)) throw new Error("Invalid workspace ID.");
  const opaqueId = createHmac("sha256", sessionSecret())
    .update(`sandbox:${workspaceId}`)
    .digest("hex")
    .slice(0, 40);
  return `sandboxed-cli-${opaqueId}`;
}

function toIdentity(id: string): WorkspaceIdentity {
  return { id, sandboxName: deriveSandboxName(id) };
}

export async function getWorkspaceIdentity() {
  const cookieStore = await cookies();
  const id = parseWorkspaceCookie(cookieStore.get(COOKIE_NAME)?.value);
  return id ? toIdentity(id) : null;
}

export async function getOrCreateWorkspaceIdentity() {
  const cookieStore = await cookies();
  const existing = parseWorkspaceCookie(cookieStore.get(COOKIE_NAME)?.value);
  if (existing) return toIdentity(existing);

  const id = randomBytes(32).toString("hex");
  cookieStore.set(COOKIE_NAME, serializeWorkspaceCookie(id), {
    httpOnly: true,
    maxAge: COOKIE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    priority: "high",
  });
  return toIdentity(id);
}

export async function clearWorkspaceIdentity() {
  (await cookies()).delete(COOKIE_NAME);
}
