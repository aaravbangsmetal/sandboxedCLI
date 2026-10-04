import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { GIT_DIFF_SCRIPT } from "./git-diff";

function withRepository(test: (directory: string) => void) {
  const directory = mkdtempSync(join(tmpdir(), "sandboxed-diff-"));
  try {
    const git = (...args: string[]) => execFileSync("git", ["-C", directory, ...args], { stdio: "pipe" });
    git("init");
    git("config", "user.name", "Test");
    git("config", "user.email", "test@example.com");
    writeFileSync(join(directory, "file.txt"), "initial\n");
    git("add", ".");
    git("commit", "-m", "initial");
    test(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("bounded Git diff", () => {
  it("returns large diffs successfully and marks their truncation", () => {
    withRepository((directory) => {
      writeFileSync(join(directory, "file.txt"), "added line\n".repeat(40_000));
      const result = spawnSync("python3", ["-c", GIT_DIFF_SCRIPT, directory], { encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0);
      const diff = JSON.parse(result.stdout);
      expect(diff.truncated).toBe(true);
      expect(Buffer.byteLength(diff.output)).toBe(120_000);
    });
  });

  it("includes staged changes and untracked names without false truncation", () => {
    withRepository((directory) => {
      writeFileSync(join(directory, "file.txt"), "updated\n");
      execFileSync("git", ["-C", directory, "add", "file.txt"]);
      writeFileSync(join(directory, "new.txt"), "new\n");
      const diff = JSON.parse(execFileSync("python3", ["-c", GIT_DIFF_SCRIPT, directory], { encoding: "utf8" }));
      expect(diff.output).toContain("+updated");
      expect(diff.output).toContain("new.txt");
      expect(diff.truncated).toBe(false);
    });
  });

  it("preserves Git failures instead of treating them as successful truncation", () => {
    const result = spawnSync("python3", ["-c", GIT_DIFF_SCRIPT, "/path-that-does-not-exist"], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
  });
});
