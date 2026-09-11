export class SandboxNotConfiguredError extends Error {
  constructor() {
    super(
      "Vercel Sandbox is not configured. Link the project and pull VERCEL_OIDC_TOKEN, or set VERCEL_TOKEN, VERCEL_TEAM_ID, and VERCEL_PROJECT_ID.",
    );
    this.name = "SandboxNotConfiguredError";
  }
}

export class SandboxNotFoundError extends Error {
  constructor(readonly sandboxName: string) {
    super(`Sandbox ${sandboxName} was not found.`);
    this.name = "SandboxNotFoundError";
  }
}

export class InvalidTerminalIdError extends Error {
  constructor() {
    super("Terminal IDs must contain 1-64 lowercase letters, numbers, or hyphens.");
    this.name = "InvalidTerminalIdError";
  }
}

export class DirtyRepositoryError extends Error {
  constructor() {
    super("The cloned repository has local changes that block checkout. Commit, stash, or discard them in the terminal first.");
    this.name = "DirtyRepositoryError";
  }
}

export class NoRepositoryChangesError extends Error {
  constructor() {
    super("There are no repository changes to deliver.");
    this.name = "NoRepositoryChangesError";
  }
}

export class RepositoryWorkspaceError extends Error {
  constructor(message = "No active repository is ready in this sandbox.") {
    super(message);
    this.name = "RepositoryWorkspaceError";
  }
}

export class ProtectedBranchError extends Error {
  constructor(branch: string) {
    super(`Refusing to push delivery onto protected branch "${branch}".`);
    this.name = "ProtectedBranchError";
  }
}

export class SensitiveWorkspaceFilesError extends Error {
  constructor() {
    super("Delivery refused because staged files look like secrets.");
    this.name = "SensitiveWorkspaceFilesError";
  }
}

export class PullRequestCreateError extends Error {
  constructor(
    readonly pushed: { fullName: string; branch: string; baseBranch: string; commitSha: string },
    cause?: unknown,
  ) {
    super(`Branch ${pushed.branch} was pushed, but GitHub did not open a pull request.`);
    this.name = "PullRequestCreateError";
    if (cause instanceof Error) this.cause = cause;
  }
}
