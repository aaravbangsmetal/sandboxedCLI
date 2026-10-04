import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

function runSetup(image) {
  const directory = mkdtempSync(join(tmpdir(), "sandboxed-deploy-"));
  try {
    mkdirSync(join(directory, "scripts"));
    mkdirSync(join(directory, "apps/web"), { recursive: true });
    mkdirSync(join(directory, "bin"));
    writeFileSync(join(directory, "scripts/setup.sh"), readFileSync(new URL("./setup-vercel-production.sh", import.meta.url)));
    writeFileSync(join(directory, "bin/vercel"), '#!/bin/bash\nprintf "%s|%s\\n" "$PWD" "$*" >> "$DEPLOY_TEST_LOG"\nif [ "$1" = link ]; then mkdir -p .vercel; printf "{}" > .vercel/project.json; else cat >/dev/null; fi\n', { mode: 0o755 });
    const env = {
      ...process.env,
      PATH: `${join(directory, "bin")}:${process.env.PATH}`,
      DEPLOY_TEST_LOG: join(directory, "calls"),
      NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-public",
      SUPABASE_SERVICE_ROLE_KEY: "test-private",
      GITHUB_TOKEN_ENCRYPTION_KEY: "test-encryption",
      SANDBOX_SESSION_SECRET: "test-identity",
      SANDBOX_IMAGE: image,
      VERCEL_SCOPE: "",
    };
    const result = spawnSync("bash", [join(directory, "scripts/setup.sh")], { env, encoding: "utf8" });
    return { ...result, calls: existsSync(join(directory, "calls")) ? readFileSync(join(directory, "calls"), "utf8").trim().split("\n") : [] };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("links the app before setting production-only variables and deploying", () => {
  const result = runSetup("test-agent:ready");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.calls[0], /apps\/web\|link /);
  assert.ok(result.calls.filter((call) => call.includes("env add")).every((call) => call.includes(" production ")));
  assert.ok(result.calls.every((call) => !call.includes("preview")));
  assert.match(result.calls.at(-1), /apps\/web\|deploy --prod/);
});

test("requires the custom agent image before contacting Vercel", () => {
  const result = runSetup("");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing required environment variable: SANDBOX_IMAGE/);
});
