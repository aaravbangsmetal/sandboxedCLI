import "server-only";

const pendingMutations = new Map<string, Promise<void>>();

export async function withSandboxMutationLock<T>(name: string, mutation: () => Promise<T>) {
  const previous = pendingMutations.get(name) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  pendingMutations.set(name, current);

  await previous.catch(() => undefined);
  try {
    return await mutation();
  } finally {
    release();
    if (pendingMutations.get(name) === current) pendingMutations.delete(name);
  }
}
