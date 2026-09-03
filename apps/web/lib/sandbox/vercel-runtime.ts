import "server-only";

import { APIError, Sandbox } from "@vercel/sandbox";
import { randomUUID } from "node:crypto";

import type {
  SandboxEnvironmentCheck,
  PauseResult,
  SandboxEnvironmentReport,
  SandboxRepositoryClone,
  SandboxRuntime,
  SandboxStatus,
  TerminalConnection,
} from "./contracts";
import { hasVercelSandboxCredentials, sandboxConfig } from "./config";
import { SandboxNotConfiguredError, SandboxNotFoundError } from "./errors";
import { tmuxSessionName } from "./terminal-id";

const BASH_RC = `# Managed by sandboxed/cli
if [ -f /etc/profile.d/sandboxed-cli.sh ]; then
  . /etc/profile.d/sandboxed-cli.sh
fi
export HISTFILE="${sandboxConfig.stateDirectory}/history/bash_history"
export HISTSIZE=10000
export HISTFILESIZE=20000
shopt -s histappend
PROMPT_COMMAND="history -a; history -n"
PS1=">_ "
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

function isNotFound(error: unknown) {
  return error instanceof APIError && error.response.status === 404;
}

function assertConfigured() {
  if (!hasVercelSandboxCredentials()) throw new SandboxNotConfiguredError();
}

async function ensureWorkspaceFiles(sandbox: Sandbox) {
  const directory = await sandbox.runCommand("mkdir", ["-p", sandboxConfig.stateDirectory]);
  if (directory.exitCode !== 0) throw new Error(await directory.stderr());
  await sandbox.writeFiles([
    {
      path: `${sandboxConfig.stateDirectory}/bashrc`,
      content: BASH_RC,
      mode: 0o600,
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
    return parseEnvironmentReport(stdout);
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
          'if [ -d "$3/.git" ]; then exit 17; fi',
          'git -c "http.https://github.com/.extraheader=AUTHORIZATION: bearer ${GITHUB_TOKEN}" clone --origin origin --branch "$1" --single-branch "$2" "$3"',
          'git -C "$3" config user.name "$4"',
          'git -C "$3" config user.email "$5"',
          'git -C "$3" config pull.rebase false',
          'printf "%s\n" "$3" > "/vercel/sandbox/.sandboxedcli/active_repo_path"',
        ].join("\n"),
        "clone-repository",
        branch,
        repository.cloneUrl,
        directory,
        user.login,
        email,
      ],
      cwd: sandboxConfig.cwd,
      env: { GITHUB_TOKEN: accessToken },
      timeoutMs: 120_000,
    });
    if (result.exitCode === 17) {
      return { fullName: repository.fullName, branch, directory, alreadyPresent: true };
    }
    if (result.exitCode !== 0) {
      const stderr = await result.stderr();
      throw new Error(stderr || "Repository clone failed.");
    }
    return { fullName: repository.fullName, branch, directory, alreadyPresent: false };
  }

  async openTerminal(
    name: string,
    terminalId: string,
    size: { cols: number; rows: number },
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
    const interactive = await sandbox.openInteractive();
    const safeTerminalId = tmuxSessionName(terminalId);

    return {
      sandbox: toStatus(sandbox),
      terminalId,
      connectionId: randomUUID(),
      websocketUrl: interactive.url,
      websocketToken: interactive.token,
      start: {
        type: "start",
        command: "tmux",
        args: [
          "new-session",
          "-A",
          "-s",
          safeTerminalId,
          "/bin/bash",
          "--noprofile",
          "--rcfile",
          `${sandboxConfig.stateDirectory}/bashrc`,
        ],
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
    await sandbox.extendTimeout(durationMs);
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
