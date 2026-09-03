import "server-only";

import { APIError, Sandbox } from "@vercel/sandbox";
import { randomUUID } from "node:crypto";

import type {
  PauseResult,
  SandboxEnvironmentReport,
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
cd "${sandboxConfig.cwd}"
`;

function degradedEnvironmentReport(detail: string): SandboxEnvironmentReport {
  return {
    status: "degraded",
    workspace: sandboxConfig.cwd,
    stateDirectory: sandboxConfig.stateDirectory,
    image: sandboxConfig.image,
    checks: [{ name: "sandboxed-health", status: "fail", detail }],
  };
}

function parseEnvironmentReport(stdout: string): SandboxEnvironmentReport {
  const parsed = JSON.parse(stdout) as Partial<SandboxEnvironmentReport>;
  return {
    status: parsed.status === "ok" || parsed.status === "fail" ? parsed.status : "degraded",
    workspace: typeof parsed.workspace === "string" ? parsed.workspace : sandboxConfig.cwd,
    stateDirectory:
      typeof parsed.stateDirectory === "string" ? parsed.stateDirectory : sandboxConfig.stateDirectory,
    image: sandboxConfig.image,
    checks: Array.isArray(parsed.checks)
      ? parsed.checks
          .filter((check) => {
            if (!check || typeof check !== "object") return false;
            const candidate = check as Record<string, unknown>;
            return (
              typeof candidate.name === "string" &&
              (candidate.status === "ok" || candidate.status === "fail") &&
              typeof candidate.detail === "string"
            );
          })
          .map((check) => check as SandboxEnvironmentReport["checks"][number])
      : [],
  };
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
