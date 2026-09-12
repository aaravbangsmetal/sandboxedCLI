import "server-only";

import { createHmac } from "node:crypto";

import { requireGitHubSession } from "@/lib/auth/require-session";

const WORKSPACE_ID_PATTERN = /^[a-f0-9]{64}$/;

export interface WorkspaceIdentity {
  id: string;
  sandboxName: string;
  userId: string;
}

function sessionSecret() {
  const configured = process.env.SANDBOX_SESSION_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production") return "sandboxed-cli-local-development-only";
  throw new Error("SANDBOX_SESSION_SECRET is required in production.");
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

function toIdentity(userId: string): WorkspaceIdentity {
  const id = deriveUserWorkspaceId(userId);
  return { id, sandboxName: deriveSandboxName(id), userId };
}

export async function getWorkspaceIdentity() {
  const session = await requireGitHubSession();
  return toIdentity(session.account.id);
}

export async function getOrCreateWorkspaceIdentity() {
  return getWorkspaceIdentity();
}
