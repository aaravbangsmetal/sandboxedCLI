import "server-only";

import type { SandboxRuntime } from "./contracts";
import { VercelSandboxRuntime } from "./vercel-runtime";

let runtime: SandboxRuntime | undefined;

export function getSandboxRuntime(): SandboxRuntime {
  runtime ??= new VercelSandboxRuntime();
  return runtime;
}

export function setSandboxRuntimeForTests(replacement: SandboxRuntime | undefined) {
  if (process.env.NODE_ENV !== "test") throw new Error("Sandbox runtime overrides are test-only.");
  runtime = replacement;
}
