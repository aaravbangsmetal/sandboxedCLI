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
