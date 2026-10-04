import "server-only";

import { randomUUID } from "node:crypto";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { SandboxBusyError } from "./errors";

const pendingMutations = new Map<string, Promise<void>>();
// Mutation routes are capped at 300 seconds. Keep ownership beyond that bound,
// including the 120-second Git commands, even if the request is terminated.
const LOCK_TTL_MS = 10 * 60_000;

async function acquireDatabaseLock(userId: string) {
  const holder = randomUUID();
  const supabase = createSupabaseAdminClient();
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const { error: cleanupError } = await supabase
      .from("sandbox_mutation_locks")
      .delete()
      .eq("user_id", userId)
      .lt("expires_at", new Date().toISOString());
    if (cleanupError) throw new Error("Unable to acquire sandbox mutation lock.", { cause: cleanupError });
    const { error } = await supabase.from("sandbox_mutation_locks").insert({
      user_id: userId,
      holder,
      expires_at: new Date(Date.now() + LOCK_TTL_MS).toISOString(),
    });
    if (!error) return holder;
    if (error.code !== "23505") {
      throw new Error("Unable to acquire sandbox mutation lock.", { cause: error });
    }
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new SandboxBusyError();
}

async function releaseDatabaseLock(userId: string, holder: string) {
  const supabase = createSupabaseAdminClient();
  await supabase.from("sandbox_mutation_locks").delete().eq("user_id", userId).eq("holder", holder);
}

/** Serializes mutations per user across this isolate and, outside tests, across server isolates. */
export async function withSandboxMutationLock<T>(userId: string, mutation: () => Promise<T>) {
  const previous = pendingMutations.get(userId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  pendingMutations.set(userId, current);

  await previous.catch(() => undefined);
  let holder: string | null = null;
  try {
    if (process.env.NODE_ENV !== "test") {
      holder = await acquireDatabaseLock(userId);
    }
    return await mutation();
  } finally {
    if (holder) await releaseDatabaseLock(userId, holder).catch(() => undefined);
    release();
    if (pendingMutations.get(userId) === current) pendingMutations.delete(userId);
  }
}
