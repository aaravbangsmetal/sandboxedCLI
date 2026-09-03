export const SANDBOX_STATES = [
  "absent",
  "pending",
  "running",
  "stopping",
  "stopped",
  "failed",
  "aborted",
  "snapshotting",
] as const;

export type SandboxState = (typeof SANDBOX_STATES)[number];

export interface SandboxUsage {
  activeCpuMs?: number;
  durationMs?: number;
  ingressBytes?: number;
  egressBytes?: number;
}

export interface SandboxStatus {
  name: string;
  state: SandboxState;
  persistent: boolean;
  filesystemPreserved: boolean;
  processMemoryPreserved: false;
  sessionId?: string;
  snapshotId?: string;
  createdAt?: string;
  updatedAt?: string;
  expiresAt?: string;
  timeoutMs?: number;
  vcpus?: number;
  memoryMb?: number;
  usage?: SandboxUsage;
}

export interface TerminalConnection {
  sandbox: SandboxStatus;
  terminalId: string;
  connectionId: string;
  websocketUrl: string;
  websocketToken: string;
  start: {
    type: "start";
    command: string;
    args: string[];
    env: string[];
    cwd: string;
    cols: number;
    rows: number;
  };
}

export interface PauseResult {
  sandbox: SandboxStatus;
  snapshotId?: string;
}

export interface SandboxEnvironmentCheck {
  name: string;
  status: "ok" | "fail";
  detail: string;
}

export interface SandboxEnvironmentReport {
  status: "ok" | "degraded" | "fail";
  workspace: string;
  stateDirectory: string;
  image: string;
  checks: SandboxEnvironmentCheck[];
}

export interface SandboxRepositoryClone {
  fullName: string;
  branch: string;
  directory: string;
  alreadyPresent: boolean;
}

export interface SandboxRuntime {
  isConfigured(): boolean;
  getStatus(name: string): Promise<SandboxStatus>;
  ensureRunning(name: string): Promise<SandboxStatus>;
  checkEnvironment(name: string): Promise<SandboxEnvironmentReport>;
  cloneRepository(
    name: string,
    repository: {
      fullName: string;
      cloneUrl: string;
      defaultBranch: string;
    },
    accessToken: string,
    user: { login: string; email: string | null },
    branch?: string,
  ): Promise<SandboxRepositoryClone>;
  openTerminal(
    name: string,
    terminalId: string,
    size: { cols: number; rows: number },
  ): Promise<TerminalConnection>;
  pause(name: string): Promise<PauseResult>;
  extend(name: string, durationMs: number): Promise<SandboxStatus>;
  killTerminal(name: string, terminalId: string): Promise<void>;
  destroy(name: string): Promise<void>;
}
