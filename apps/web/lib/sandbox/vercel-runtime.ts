import "server-only";

import { APIError, Sandbox } from "@vercel/sandbox";
import { randomUUID } from "node:crypto";

import type {
  SandboxEnvironmentCheck,
  PauseResult,
  SandboxActiveRepository,
  SandboxEnvironmentReport,
  SandboxGitDiff,
  SandboxGitStatus,
  SandboxPushedBranch,
  SandboxRepositoryClone,
  SandboxRuntime,
  SandboxStatus,
  TerminalConnection,
} from "./contracts";
import { hasVercelSandboxCredentials, sandboxConfig } from "./config";
import {
  DirtyRepositoryError,
  NoRepositoryChangesError,
  ProtectedBranchError,
  RepositoryWorkspaceError,
  SandboxNotConfiguredError,
  SandboxNotFoundError,
  SensitiveWorkspaceFilesError,
} from "./errors";
import { tmuxSessionName } from "./terminal-id";

const BASH_RC = `# Managed by sandboxed/cli
if [ -f /etc/profile.d/sandboxed-cli.sh ]; then
  . /etc/profile.d/sandboxed-cli.sh
fi
export HISTFILE="${sandboxConfig.stateDirectory}/history/bash_history"
export HISTSIZE=10000
export HISTFILESIZE=20000
export PATH="${sandboxConfig.stateDirectory}/bin:$PATH"
shopt -s histappend
PROMPT_COMMAND="history -a; history -n"
PS1=">_ "
git config --global credential.helper "${sandboxConfig.stateDirectory}/bin/git-credential-sandboxedcli"
if [ -f "${sandboxConfig.stateDirectory}/active_repo_path" ]; then
  repo_path="$(cat "${sandboxConfig.stateDirectory}/active_repo_path")"
  if [ -d "$repo_path/.git" ]; then
    cd "$repo_path"
  else
    cd "${sandboxConfig.cwd}"
  fi
else
  cd "${sandboxConfig.cwd}"
fi
`;

const GIT_CREDENTIAL_HELPER = `#!/bin/sh
set -eu
[ "\${1:-}" = "get" ] || exit 0
protocol=""
host=""
while IFS='=' read -r key value; do
  case "$key" in
    protocol) protocol="$value" ;;
    host) host="$value" ;;
  esac
done
[ "$protocol" = "https" ] || exit 0
[ "$host" = "github.com" ] || exit 0
[ -n "\${GITHUB_TOKEN:-}" ] || exit 0
printf 'username=x-access-token\\npassword=%s\\n' "$GITHUB_TOKEN"
`;

const REPOSITORY_FULL_NAME_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const BRANCH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,240}$/;

function degradedEnvironmentReport(detail: string): SandboxEnvironmentReport {
  return {
    status: "degraded",
    workspace: sandboxConfig.cwd,
    stateDirectory: sandboxConfig.stateDirectory,
    image: sandboxConfig.image,
    checks: [{ name: "sandboxed-health", status: "fail", detail }],
  };
}

function parseEnvironmentCheck(check: unknown): SandboxEnvironmentCheck | null {
  if (!check || typeof check !== "object") return null;
  const candidate = check as Record<string, unknown>;
  if (
    typeof candidate.name !== "string" ||
    (candidate.status !== "ok" && candidate.status !== "fail") ||
    typeof candidate.detail !== "string"
  ) {
    return null;
  }
  return {
    name: candidate.name,
    status: candidate.status,
    detail: candidate.detail,
  };
}

function parseEnvironmentReport(stdout: string): SandboxEnvironmentReport {
  const parsed = JSON.parse(stdout) as Partial<SandboxEnvironmentReport>;
  const checks = Array.isArray(parsed.checks)
    ? parsed.checks.flatMap((check) => {
        const parsedCheck = parseEnvironmentCheck(check);
        return parsedCheck ? [parsedCheck] : [];
      })
    : [];

  return {
    status: parsed.status === "ok" || parsed.status === "fail" ? parsed.status : "degraded",
    workspace: typeof parsed.workspace === "string" ? parsed.workspace : sandboxConfig.cwd,
    stateDirectory:
      typeof parsed.stateDirectory === "string" ? parsed.stateDirectory : sandboxConfig.stateDirectory,
    image: sandboxConfig.image,
    checks,
  };
}

function repositoryDirectory(fullName: string) {
  if (!REPOSITORY_FULL_NAME_PATTERN.test(fullName)) {
    throw new Error("Repository names must use the owner/name format.");
  }
  return `${sandboxConfig.cwd}/repos/${fullName.replaceAll("/", "__")}`;
}

function assertSafeBranch(branch: string) {
  if (!BRANCH_PATTERN.test(branch) || branch.includes("..") || branch.endsWith(".lock")) {
    throw new Error("Branch names may only contain safe Git ref characters.");
  }
}

const PROTECTED_BRANCH_NAMES = new Set(["main", "master", "trunk", "production"]);

function assertDeliveryBranch(branch: string, defaultBranch: string) {
  assertSafeBranch(branch);
  const normalized = branch.toLowerCase();
  if (normalized === defaultBranch.toLowerCase() || PROTECTED_BRANCH_NAMES.has(normalized)) {
    throw new ProtectedBranchError(branch);
  }
}

async function commandStdoutOrThrow(
  result: Awaited<ReturnType<Sandbox["runCommand"]>>,
  fallback: string,
) {
  const stdout = await result.stdout();
  if (result.exitCode === 0) return stdout;
  const stderr = await result.stderr();
  throw new Error(stderr || stdout || fallback);
}

function splitRepositoryCommandOutput(output: string) {
  const newline = output.indexOf("\n");
  if (newline === -1) return { repositoryDirectory: output.trim(), output: "" };
  return {
    repositoryDirectory: output.slice(0, newline).trim(),
    output: output.slice(newline + 1),
  };
}

function parsePushedBranch(output: string): SandboxPushedBranch {
  const [fullName, branch, baseBranch, commitSha] = output.trim().split("\n");
  if (!fullName || !branch || !/^[a-f0-9]{40}$/.test(commitSha || "")) {
    throw new RepositoryWorkspaceError("Sandbox did not return pushed branch metadata.");
  }
  return { fullName, branch, baseBranch: baseBranch || "main", commitSha };
}

function isNotFound(error: unknown) {
  return error instanceof APIError && error.response.status === 404;
}

function assertConfigured() {
  if (!hasVercelSandboxCredentials()) throw new SandboxNotConfiguredError();
}

async function ensureWorkspaceFiles(sandbox: Sandbox) {
  const directory = await sandbox.runCommand("mkdir", [
    "-p",
    sandboxConfig.stateDirectory,
    `${sandboxConfig.stateDirectory}/bin`,
    `${sandboxConfig.stateDirectory}/history`,
  ]);
  if (directory.exitCode !== 0) throw new Error(await directory.stderr());
  await sandbox.writeFiles([
    {
      path: `${sandboxConfig.stateDirectory}/bashrc`,
      content: BASH_RC,
      mode: 0o600,
    },
    {
      path: `${sandboxConfig.stateDirectory}/bin/git-credential-sandboxedcli`,
      content: GIT_CREDENTIAL_HELPER,
      mode: 0o700,
    },
  ]);
}

function toStatus(sandbox: Sandbox): SandboxStatus {
  let sessionId: string | undefined;
  try {
    sessionId = sandbox.currentSession().sessionId;
  } catch {
    sessionId = undefined;
  }

  return {
    name: sandbox.name,
    state: sandbox.status,
    persistent: sandbox.persistent,
    filesystemPreserved: sandbox.persistent,
    processMemoryPreserved: false,
    sessionId,
    snapshotId: sandbox.currentSnapshotId,
    createdAt: sandbox.createdAt?.toISOString(),
    updatedAt: sandbox.updatedAt?.toISOString(),
    expiresAt: sandbox.expiresAt?.toISOString(),
    timeoutMs: sandbox.timeout,
    vcpus: sandbox.vcpus,
    memoryMb: sandbox.memory,
    usage: {
      activeCpuMs: sandbox.totalActiveCpuDurationMs,
      durationMs: sandbox.totalDurationMs,
      ingressBytes: sandbox.totalIngressBytes,
      egressBytes: sandbox.totalEgressBytes,
    },
  };
}

async function getSandbox(name: string, resume = false) {
  assertConfigured();
  try {
    return await Sandbox.get({ name, resume });
  } catch (error) {
    if (isNotFound(error)) throw new SandboxNotFoundError(name);
    throw error;
  }
}

export class VercelSandboxRuntime implements SandboxRuntime {
  isConfigured() {
    return hasVercelSandboxCredentials();
  }

  async getStatus(name: string) {
    try {
      return toStatus(await getSandbox(name));
    } catch (error) {
      if (error instanceof SandboxNotFoundError) {
        return {
          name,
          state: "absent",
          persistent: true,
          filesystemPreserved: false,
          processMemoryPreserved: false,
        } satisfies SandboxStatus;
      }
      throw error;
    }
  }

  async ensureRunning(name: string) {
    assertConfigured();
    const sandbox = await Sandbox.getOrCreate({
      name,
      image: sandboxConfig.image,
      persistent: true,
      timeout: sandboxConfig.timeoutMs,
      resources: { vcpus: sandboxConfig.vcpus },
      snapshotExpiration: sandboxConfig.snapshotExpirationMs,
      keepLastSnapshots: { count: sandboxConfig.keepSnapshots, deleteEvicted: true },
      tags: { product: "sandboxed-cli", phase: "sandbox" },
      resume: true,
      onCreate: ensureWorkspaceFiles,
      onResume: ensureWorkspaceFiles,
    });
    return toStatus(sandbox);
  }

  async checkEnvironment(name: string) {
    const sandbox = await getSandbox(name, true);
    const result = await sandbox.runCommand("sh", [
      "-lc",
      "if command -v sandboxed-health >/dev/null 2>&1; then sandboxed-health --json; else printf '%s' 'sandboxed-health missing'; exit 127; fi",
    ]);
    const stdout = await result.stdout();
    if (result.exitCode === 127) return degradedEnvironmentReport(stdout || "missing");
    if (result.exitCode !== 0) {
      const stderr = await result.stderr();
      throw new Error(stderr || stdout || "Sandbox environment health check failed.");
    }
    try {
      return parseEnvironmentReport(stdout);
    } catch {
      return degradedEnvironmentReport(stdout.trim().slice(0, 200) || "invalid health json");
    }
  }

  async cloneRepository(
    name: string,
    repository: {
      fullName: string;
      cloneUrl: string;
      defaultBranch: string;
    },
    accessToken: string,
    user: { login: string; email: string | null },
    branch = repository.defaultBranch,
  ): Promise<SandboxRepositoryClone> {
    assertSafeBranch(branch);
    const sandbox = await Sandbox.getOrCreate({
      name,
      image: sandboxConfig.image,
      persistent: true,
      timeout: sandboxConfig.timeoutMs,
      resources: { vcpus: sandboxConfig.vcpus },
      snapshotExpiration: sandboxConfig.snapshotExpirationMs,
      keepLastSnapshots: { count: sandboxConfig.keepSnapshots, deleteEvicted: true },
      tags: { product: "sandboxed-cli", phase: "backend" },
      resume: true,
      onCreate: ensureWorkspaceFiles,
      onResume: ensureWorkspaceFiles,
    });
    const directory = repositoryDirectory(repository.fullName);
    const email = user.email || `${user.login}@users.noreply.github.com`;
    const result = await sandbox.runCommand({
      cmd: "sh",
      args: [
        "-lc",
        [
          'set -euo pipefail',
          'mkdir -p "$(dirname "$3")"',
          'if [ -d "$3/.git" ]; then',
          '  git -C "$3" remote set-url origin "$2"',
          '  git -C "$3" -c "http.https://github.com/.extraheader=AUTHORIZATION: bearer ${GITHUB_TOKEN}" fetch origin "$1"',
          '  if git -C "$3" show-ref --verify --quiet "refs/heads/$1"; then',
          '    git -C "$3" checkout "$1" || exit 21',
          '  else',
          '    git -C "$3" checkout --track -b "$1" "origin/$1" || exit 21',
          '  fi',
          '  already_present=1',
          'else',
          'git -c "http.https://github.com/.extraheader=AUTHORIZATION: bearer ${GITHUB_TOKEN}" clone --origin origin --branch "$1" --single-branch "$2" "$3"',
          '  already_present=0',
          'fi',
          'git -C "$3" config user.name "$4"',
          'git -C "$3" config user.email "$5"',
          'git -C "$3" config pull.rebase false',
          'printf "%s\n" "$3" > "/vercel/sandbox/.sandboxedcli/active_repo_path"',
          'printf "%s\n" "$6" > "/vercel/sandbox/.sandboxedcli/active_repo_full_name"',
          'printf "%s\n" "$7" > "/vercel/sandbox/.sandboxedcli/active_repo_default_branch"',
          '[ "$already_present" = 0 ] || exit 17',
        ].join("\n"),
        "clone-repository",
        branch,
        repository.cloneUrl,
        directory,
        user.login,
        email,
        repository.fullName,
        repository.defaultBranch,
      ],
      cwd: sandboxConfig.cwd,
      env: { GITHUB_TOKEN: accessToken },
      timeoutMs: 120_000,
    });
    if (result.exitCode === 17) {
      return { fullName: repository.fullName, branch, directory, alreadyPresent: true };
    }
    if (result.exitCode === 21) throw new DirtyRepositoryError();
    if (result.exitCode !== 0) {
      const stderr = await result.stderr();
      throw new Error(stderr || "Repository clone failed.");
    }
    return { fullName: repository.fullName, branch, directory, alreadyPresent: false };
  }

  async gitStatus(name: string): Promise<SandboxGitStatus> {
    const sandbox = await getSandbox(name, true);
    const result = await sandbox.runCommand({
      cmd: "sh",
      args: [
        "-lc",
        [
          'set -euo pipefail',
          'repo="$(cat "/vercel/sandbox/.sandboxedcli/active_repo_path")"',
          'case "$repo" in /vercel/sandbox/repos/*) ;; *) exit 18 ;; esac',
          'test -d "$repo/.git"',
          'printf "%s\n" "$repo"',
          'git -C "$repo" status --short --branch',
        ].join("\n"),
      ],
      cwd: sandboxConfig.cwd,
      timeoutMs: 30_000,
    });
    if (result.exitCode === 18) throw new RepositoryWorkspaceError();
    return splitRepositoryCommandOutput(await commandStdoutOrThrow(result, "Git status failed."));
  }

  async gitDiff(name: string): Promise<SandboxGitDiff> {
    const sandbox = await getSandbox(name, true);
    const result = await sandbox.runCommand({
      cmd: "sh",
      args: [
        "-lc",
        [
          'set -euo pipefail',
          'repo="$(cat "/vercel/sandbox/.sandboxedcli/active_repo_path")"',
          'case "$repo" in /vercel/sandbox/repos/*) ;; *) exit 18 ;; esac',
          'test -d "$repo/.git"',
          'printf "%s\n" "$repo"',
          'git -C "$repo" diff --stat HEAD',
          'git -C "$repo" diff --no-ext-diff --color=never HEAD | head -c 120000',
          'untracked="$(git -C "$repo" ls-files --others --exclude-standard)"',
          'if [ -n "$untracked" ]; then printf "\\n-- untracked --\\n%s\\n" "$untracked"; fi',
        ].join("\n"),
      ],
      cwd: sandboxConfig.cwd,
      timeoutMs: 30_000,
    });
    if (result.exitCode === 18) throw new RepositoryWorkspaceError();
    const output = await commandStdoutOrThrow(result, "Git diff failed.");
    const parsed = splitRepositoryCommandOutput(output);
    return {
      repositoryDirectory: parsed.repositoryDirectory,
      output: parsed.output,
      truncated: parsed.output.length >= 120000,
    };
  }

  async readActiveRepository(name: string): Promise<SandboxActiveRepository> {
    const sandbox = await getSandbox(name, true);
    const result = await sandbox.runCommand({
      cmd: "sh",
      args: [
        "-lc",
        [
          'set -euo pipefail',
          'repo="$(cat "/vercel/sandbox/.sandboxedcli/active_repo_path")"',
          'full_name="$(cat "/vercel/sandbox/.sandboxedcli/active_repo_full_name")"',
          'base_branch="$(cat "/vercel/sandbox/.sandboxedcli/active_repo_default_branch")"',
          'case "$repo" in /vercel/sandbox/repos/*) ;; *) exit 18 ;; esac',
          'test -d "$repo/.git"',
          'printf "%s\n%s\n%s\n" "$repo" "$full_name" "$base_branch"',
        ].join("\n"),
      ],
      cwd: sandboxConfig.cwd,
      timeoutMs: 15_000,
    });
    if (result.exitCode === 18) throw new RepositoryWorkspaceError();
    const [directory, fullName, defaultBranch] = (await commandStdoutOrThrow(result, "Active repository lookup failed."))
      .trim()
      .split("\n");
    if (!directory || !fullName || !REPOSITORY_FULL_NAME_PATTERN.test(fullName) || !defaultBranch) {
      throw new RepositoryWorkspaceError();
    }
    const expectedDirectory = repositoryDirectory(fullName);
    if (directory !== expectedDirectory) throw new RepositoryWorkspaceError("Active repository metadata does not match the workspace path.");
    return { directory, fullName, defaultBranch };
  }

  async commitAndPushActiveRepository(
    name: string,
    accessToken: string,
    input: { branch: string; message: string; fullName: string; defaultBranch: string },
  ): Promise<SandboxPushedBranch> {
    assertDeliveryBranch(input.branch, input.defaultBranch);
    if (!input.message.trim()) throw new SyntaxError("Commit message is required.");
    if (!REPOSITORY_FULL_NAME_PATTERN.test(input.fullName)) {
      throw new SyntaxError("Repository names must use the owner/name format.");
    }
    const sandbox = await getSandbox(name, true);
    const result = await sandbox.runCommand({
      cmd: "sh",
      args: [
        "-lc",
        [
          'set -euo pipefail',
          'repo="$(cat "/vercel/sandbox/.sandboxedcli/active_repo_path")"',
          'full_name="$(cat "/vercel/sandbox/.sandboxedcli/active_repo_full_name")"',
          'base_branch="$(cat "/vercel/sandbox/.sandboxedcli/active_repo_default_branch")"',
          'case "$repo" in /vercel/sandbox/repos/*) ;; *) exit 18 ;; esac',
          'test -d "$repo/.git"',
          '[ "$full_name" = "$3" ] || exit 18',
          '[ "$repo" = "$4" ] || exit 18',
          'if [ -z "$(git -C "$repo" status --porcelain)" ]; then exit 19; fi',
          'git -C "$repo" checkout -B "$1"',
          'git -C "$repo" add -A',
          'if git -C "$repo" diff --cached --name-only | grep -E \'(^|/)\\.env($|\\.)|(^|/)id_(rsa|ed25519|ecdsa)($|\\.)|\\.pem$|(^|/)credentials\\.json$|(^|/)\\.git-credentials$\' >/dev/null; then git -C "$repo" reset >/dev/null; exit 20; fi',
          'if git -C "$repo" diff --cached --quiet; then exit 19; fi',
          'git -C "$repo" commit -m "$2"',
          'git -C "$repo" -c "http.https://github.com/.extraheader=AUTHORIZATION: bearer ${GITHUB_TOKEN}" push origin "HEAD:$1"',
          'commit_sha="$(git -C "$repo" rev-parse HEAD)"',
          'printf "%s\n%s\n%s\n%s\n" "$3" "$1" "$5" "$commit_sha"',
        ].join("\n"),
        "commit-and-push",
        input.branch,
        input.message,
        input.fullName,
        repositoryDirectory(input.fullName),
        input.defaultBranch,
      ],
      cwd: sandboxConfig.cwd,
      env: { GITHUB_TOKEN: accessToken },
      timeoutMs: 120_000,
    });
    if (result.exitCode === 18) throw new RepositoryWorkspaceError();
    if (result.exitCode === 19) throw new NoRepositoryChangesError();
    if (result.exitCode === 20) throw new SensitiveWorkspaceFilesError();
    const pushed = parsePushedBranch(await commandStdoutOrThrow(result, "Failed to push repository changes."));
    if (pushed.fullName !== input.fullName) throw new RepositoryWorkspaceError("Pushed repository did not match GitHub access.");
    return { ...pushed, baseBranch: input.defaultBranch };
  }

  async openTerminal(
    name: string,
    terminalId: string,
    size: { cols: number; rows: number },
    githubAccessToken: string,
  ): Promise<TerminalConnection> {
    const sandbox = await Sandbox.getOrCreate({
      name,
      image: sandboxConfig.image,
      persistent: true,
      timeout: sandboxConfig.timeoutMs,
      resources: { vcpus: sandboxConfig.vcpus },
      snapshotExpiration: sandboxConfig.snapshotExpirationMs,
      keepLastSnapshots: { count: sandboxConfig.keepSnapshots, deleteEvicted: true },
      tags: { product: "sandboxed-cli", phase: "sandbox" },
      resume: true,
      onCreate: ensureWorkspaceFiles,
      onResume: ensureWorkspaceFiles,
    });
    const safeTerminalId = tmuxSessionName(terminalId);
    const terminal = await sandbox.runCommand({
      cmd: "tmux",
      args: [
        "new-session",
        "-A",
        "-d",
        "-s",
        safeTerminalId,
        "/bin/bash",
        "--noprofile",
        "--rcfile",
        `${sandboxConfig.stateDirectory}/bashrc`,
      ],
      cwd: sandboxConfig.cwd,
      env: { GITHUB_TOKEN: githubAccessToken, GH_TOKEN: githubAccessToken },
      timeoutMs: 30_000,
    });
    if (terminal.exitCode !== 0) throw new Error((await terminal.stderr()) || "Unable to start terminal.");
    const interactive = await sandbox.openInteractive();

    return {
      sandbox: toStatus(sandbox),
      terminalId,
      connectionId: randomUUID(),
      websocketUrl: interactive.url,
      websocketToken: interactive.token,
      start: {
        type: "start",
        command: "tmux",
        args: ["attach-session", "-t", safeTerminalId],
        env: ["TERM=xterm-256color", "COLORTERM=truecolor"],
        cwd: sandboxConfig.cwd,
        cols: size.cols,
        rows: size.rows,
      },
    };
  }

  async pause(name: string): Promise<PauseResult> {
    const sandbox = await getSandbox(name);
    if (sandbox.status === "stopped") return { sandbox: toStatus(sandbox) };
    const stopped = await sandbox.stop();
    const refreshed = await Sandbox.get({ name, resume: false });
    return { sandbox: toStatus(refreshed), snapshotId: stopped.snapshot?.id };
  }

  async extend(name: string, durationMs: number) {
    const sandbox = await getSandbox(name);
    if (sandbox.status !== "running") return toStatus(sandbox);
    const startedAt = sandbox.createdAt?.getTime() ?? Date.now();
    const expiresAt = sandbox.expiresAt?.getTime() ?? Date.now() + sandboxConfig.timeoutMs;
    const cap = startedAt + sandboxConfig.maxLifetimeMs;
    const extendBy = Math.min(durationMs, cap - expiresAt);
    if (extendBy < 60_000) return toStatus(sandbox);
    await sandbox.extendTimeout(extendBy);
    return toStatus(await Sandbox.get({ name, resume: false }));
  }

  async killTerminal(name: string, terminalId: string) {
    const sandbox = await getSandbox(name);
    if (sandbox.status !== "running") return;
    const result = await sandbox.runCommand("tmux", ["kill-session", "-t", tmuxSessionName(terminalId)]);
    if (result.exitCode !== 0) {
      const stderr = await result.stderr();
      if (!stderr.includes("can't find session")) throw new Error(stderr || "Unable to kill terminal.");
    }
  }

  async destroy(name: string) {
    try {
      const sandbox = await getSandbox(name);
      await sandbox.delete({ deleteOrphanSnapshots: true });
    } catch (error) {
      if (!(error instanceof SandboxNotFoundError)) throw error;
    }
  }
}
