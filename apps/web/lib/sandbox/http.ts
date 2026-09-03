import "server-only";

import { APIError } from "@vercel/sandbox";
import { NextResponse } from "next/server";

import {
  AuthenticationRequiredError,
} from "@/lib/auth/require-session";

import {
  InvalidTerminalIdError,
  SandboxNotConfiguredError,
  SandboxNotFoundError,
} from "./errors";
import { UnsafeSandboxRequestError } from "./request-security";

export function sandboxJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store, max-age=0");
  return NextResponse.json(body, { ...init, headers });
}

export function sandboxErrorResponse(error: unknown) {
  if (error instanceof AuthenticationRequiredError) {
    return sandboxJson({ error: error.message, code: "authentication_required" }, { status: 401 });
  }
  if (error instanceof UnsafeSandboxRequestError) {
    return sandboxJson({ error: error.message, code: "unsafe_request" }, { status: 403 });
  }
  if (error instanceof SandboxNotConfiguredError) {
    return sandboxJson({ error: error.message, code: "sandbox_not_configured" }, { status: 503 });
  }
  if (error instanceof SandboxNotFoundError) {
    return sandboxJson({ error: "Workspace not found.", code: "sandbox_not_found" }, { status: 404 });
  }
  if (error instanceof InvalidTerminalIdError || error instanceof SyntaxError) {
    return sandboxJson({ error: error.message, code: "invalid_request" }, { status: 400 });
  }
  if (error instanceof APIError) {
    const status = error.response.status >= 400 && error.response.status < 500 ? 409 : 502;
    return sandboxJson(
      { error: "The sandbox provider could not complete this request.", code: "provider_error" },
      { status },
    );
  }

  console.error("Sandbox request failed", error);
  return sandboxJson({ error: "Sandbox request failed.", code: "sandbox_error" }, { status: 500 });
}
