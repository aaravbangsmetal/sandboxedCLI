import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { GIT_DELIVERY_SCRIPT, SENSITIVE_FILES_SCRIPT } from "./git-delivery";

function withRepository(test: (fixture: ReturnType<typeof createFixture>) => void) {
  const root = mkdtempSync(join(tmpdir(), "sandboxed-delivery-"));
  try { test(createFixture(root)); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

function createFixture(root: string) {
  const repo = join(root, "repos/octocat__hello-world");
  const remote = join(root, "remote.git");
  const metadata = join(root, ".sandboxedcli");
  mkdirSync(repo, { recursive: true });
  mkdirSync(metadata);
  execFileSync("git", ["init", "--bare", remote], { stdio: "pipe" });
  const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: "pipe" }).trim();
  git("init", "-b", "main");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  git("remote", "add", "origin", remote);
  writeFileSync(join(repo, "file.txt"), "initial\n");
  git("add", ".");
  git("commit", "-m", "initial");
  git("push", "-u", "origin", "main");
  writeFileSync(join(metadata, "active_repo_path"), repo);
  writeFileSync(join(metadata, "active_repo_full_name"), "octocat/hello-world");
  const deliver = (branch = "sandboxedcli/test") => spawnSync("bash", [
    "-lc", GIT_DELIVERY_SCRIPT.replaceAll("/vercel/sandbox", root), "delivery",
    branch, "Test changes", "octocat/hello-world", repo, "main", SENSITIVE_FILES_SCRIPT,
  ], { encoding: "utf8" });
  return { root, repo, remote, git, deliver };
}

describe("Git delivery", () => {
  it("returns only metadata after a real commit and push", () => {
    withRepository(({ repo, git, deliver }) => {
      writeFileSync(join(repo, "file.txt"), "changed\n");
      const result = deliver();
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout.trim().split("\n")).toEqual(["octocat/hello-world", "sandboxedcli/test", "main", git("rev-parse", "HEAD")]);
      expect(git("status", "--porcelain")).toBe("");
    });
  });

  it("keeps a failed push's commit and retries it without another commit", () => {
    withRepository(({ repo, remote, git, deliver }) => {
      writeFileSync(join(repo, "file.txt"), "changed\n");
      const hook = join(remote, "hooks/pre-receive");
      writeFileSync(hook, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
      expect(deliver().status).not.toBe(0);
      const commit = git("rev-parse", "HEAD");
      expect(git("branch", "--show-current")).toBe("sandboxedcli/test");
      rmSync(hook);
      const retried = deliver();
      expect(retried.status, retried.stderr).toBe(0);
      expect(git("rev-parse", "HEAD")).toBe(commit);
    });
  });

  it("refuses to overwrite a delivery branch with different commits", () => {
    withRepository(({ repo, git, deliver }) => {
      git("branch", "sandboxedcli/test");
      writeFileSync(join(repo, "file.txt"), "committed\n");
      git("commit", "-am", "user commit");
      const original = git("rev-parse", "sandboxedcli/test");
      expect(deliver().status).toBe(22);
      expect(git("rev-parse", "sandboxedcli/test")).toBe(original);
      expect(git("branch", "--show-current")).toBe("main");
    });
  });

  it("refuses secret filenames with unusual characters without changing staging", () => {
    withRepository(({ repo, git, deliver }) => {
      mkdirSync(join(repo, "odd\nfolder"));
      writeFileSync(join(repo, "odd\nfolder/.env"), "TEST_SECRET=placeholder\n");
      writeFileSync(join(repo, "file.txt"), "changed\n");
      git("add", "file.txt");
      const before = git("diff", "--cached");
      expect(deliver().status).toBe(20);
      expect(git("diff", "--cached")).toBe(before);
      expect(git("branch", "--show-current")).toBe("main");
    });
  });

  it("allows environment templates and delivery of already committed changes", () => {
    withRepository(({ repo, git, deliver }) => {
      writeFileSync(join(repo, ".env.example"), "TEST_KEY=\n");
      git("add", ".env.example");
      git("commit", "-m", "template");
      expect(deliver().status).toBe(0);
    });
  });
});
