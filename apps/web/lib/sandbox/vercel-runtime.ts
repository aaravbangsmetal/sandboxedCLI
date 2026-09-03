import "server-only";

import { APIError, Sandbox } from "@vercel/sandbox";
import { randomUUID } from "node:crypto";

import type {
  PauseResult,
  SandboxRuntime,
  SandboxStatus,
  TerminalConnection,
} from "./contracts";
import { hasVercelSandboxCredentials, sandboxConfig } from "./config";
import { SandboxNotConfiguredError, SandboxNotFoundError } from "./errors";
import { tmuxSessionName } from "./terminal-id";

const BASH_RC = `# Managed by sandboxed/cli
export HISTFILE="${sandboxConfig.stateDirectory}/history"
export HISTSIZE=10000
export HISTFILESIZE=20000
shopt -s histappend
PROMPT_COMMAND="history -a; history -n"
PS1=">_ "
cd "${sandboxConfig.cwd}"
`;

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
