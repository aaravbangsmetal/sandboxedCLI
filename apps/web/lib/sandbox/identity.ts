import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { requireGitHubSession } from "@/lib/auth/require-session";

const COOKIE_NAME = "sandboxedcli_workspace";
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

export function deriveUserWorkspaceId(userId: string) {
  if (!userId.trim()) throw new Error("A Supabase user ID is required.");
  return createHmac("sha256", sessionSecret()).update(`user:${userId}`).digest("hex");
}

function toIdentity(id: string): WorkspaceIdentity {
  return { id, sandboxName: deriveSandboxName(id) };
}

export async function getWorkspaceIdentity() {
  const session = await requireGitHubSession();
  return toIdentity(deriveUserWorkspaceId(session.account.id));
}

export async function getOrCreateWorkspaceIdentity() {
  return getWorkspaceIdentity();
}

export async function clearWorkspaceIdentity() {
  (await cookies()).delete(COOKIE_NAME);
}
