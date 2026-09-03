"use client";

import { useCallback, useEffect, useState } from "react";

import type { SandboxStatus } from "@/lib/sandbox/contracts";

import styles from "./terminal-workspace.module.css";

interface StatusResponse {
  configured: boolean;
  sandbox: SandboxStatus;
}

interface SandboxControlsProps {
  onPause: () => void;
  onResume: () => void;
  onDestroy: () => void;
}

async function responseBody(response: Response) {
  const body = (await response.json().catch(() => null)) as
    | { error?: string; sandbox?: SandboxStatus; configured?: boolean }
    | null;
  if (!response.ok) throw new Error(body?.error || `Sandbox request failed (${response.status}).`);
  return body;
}

export function SandboxControls({ onPause, onResume, onDestroy }: SandboxControlsProps) {
  const [status, setStatus] = useState<SandboxStatus | null>(null);
  const [configured, setConfigured] = useState(true);
  const [busy, setBusy] = useState<"pause" | "resume" | "extend" | "destroy" | null>(null);
  const [message, setMessage] = useState("checking workspace");
  const isRunning = status?.state === "running";

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/sandbox", { cache: "no-store" });
      const body = (await responseBody(response)) as StatusResponse;
      setConfigured(body.configured);
      setStatus(body.sandbox);
      setMessage(body.configured ? body.sandbox.state : "provider not configured");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "status unavailable");
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 15_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [refresh]);

  useEffect(() => {
    if (!isRunning) return;
    const extend = () => {
      if (document.visibilityState !== "visible") return;
      void fetch("/api/sandbox/extend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }).catch(() => undefined);
    };
    const interval = window.setInterval(extend, 4 * 60_000);
    return () => window.clearInterval(interval);
  }, [isRunning]);

  const mutate = useCallback(
    async (action: "pause" | "resume" | "extend" | "destroy") => {
      if (action === "destroy" && !window.confirm("Permanently delete this sandbox and its snapshots?")) return;
      setBusy(action);
      setMessage(`${action === "resume" ? "starting" : action === "destroy" ? "deleting" : action === "pause" ? "pausing" : "extending"} workspace`);
      if (action === "pause") onPause();

      try {
        const endpoint = action === "resume" || action === "destroy" ? "/api/sandbox" : `/api/sandbox/${action}`;
        const response = await fetch(endpoint, {
          method: action === "destroy" ? "DELETE" : "POST",
          headers: { "content-type": "application/json" },
          body: action === "destroy" ? JSON.stringify({ confirm: "destroy" }) : "{}",
        });
        const body = await responseBody(response);
        if (action === "destroy") {
          localStorage.removeItem("sandboxedcli.terminals.v1");
          setStatus(null);
          setMessage("workspace deleted");
          onDestroy();
          return;
        }
        if (body?.sandbox) setStatus(body.sandbox);
        setMessage(action === "pause" ? "stopped · files preserved" : action === "extend" ? "lease extended" : "running");
        if (action === "resume") onResume();
      } catch (error) {
        if (action === "pause") onResume();
        setMessage(error instanceof Error ? error.message : "request failed");
      } finally {
        setBusy(null);
      }
    },
    [onDestroy, onPause, onResume],
  );

  return (
    <div className={styles.lifecycleBar} aria-label="Sandbox lifecycle controls">
      <span className={styles.lifecycleStatus} role="status" aria-live="polite">
        <span className={isRunning ? styles.statusOnline : styles.statusOffline} aria-hidden="true">●</span>
        {message}
      </span>
      <span className={styles.persistenceNote}>files persist · processes reset after stop</span>
      {isRunning ? (
        <button type="button" disabled={busy !== null} onClick={() => void mutate("pause")}>&gt;_pause</button>
      ) : (
        <button type="button" disabled={!configured || busy !== null} onClick={() => void mutate("resume")}>&gt;_start</button>
      )}
      <button type="button" disabled={!isRunning || busy !== null} onClick={() => void mutate("extend")}>&gt;_extend</button>
      <button type="button" disabled={!status || status.state === "absent" || busy !== null} onClick={() => void mutate("destroy")}>&gt;_destroy</button>
    </div>
  );
}
