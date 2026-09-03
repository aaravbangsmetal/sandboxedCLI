import { randomUUID } from "node:crypto";
import { Sandbox } from "@vercel/sandbox";
import { describe, expect, it } from "vitest";

const runLive = process.env.RUN_VERCEL_SANDBOX_LIVE === "1";

describe.skipIf(!runLive)("Vercel Sandbox live persistence", () => {
  it(
    "snapshots files, resumes them, issues a PTY credential, and deletes all snapshots",
    async () => {
      const name = `sandboxed-cli-live-${randomUUID()}`;
      let sandbox: Sandbox | undefined;
      try {
        sandbox = await Sandbox.create({
          name,
          image: process.env.SANDBOX_IMAGE || "vercel/sandbox/universal:latest",
          persistent: true,
          timeout: 60_000,
          snapshotExpiration: 24 * 60 * 60 * 1_000,
        });
        const marker = `marker-${randomUUID()}`;
        const write = await sandbox.runCommand("sh", ["-lc", `printf %s ${marker} > /vercel/sandbox/.live-marker`]);
        expect(write.exitCode).toBe(0);

        await sandbox.stop();
        sandbox = await Sandbox.get({ name, resume: true });
        const read = await sandbox.runCommand("cat", ["/vercel/sandbox/.live-marker"]);
        expect(read.exitCode).toBe(0);
        expect(await read.stdout()).toBe(marker);

        const interactive = await sandbox.openInteractive();
        expect(interactive.url).toMatch(/^wss:/);
        expect(interactive.token.length).toBeGreaterThan(10);
      } finally {
        if (sandbox) await sandbox.delete({ deleteOrphanSnapshots: true });
      }
    },
    120_000,
  );
});
