"use client";

import { useCallback, useMemo, useState } from "react";

import type { SandboxGitDiff, SandboxGitStatus, SandboxPushedBranch } from "@/lib/sandbox/contracts";

import styles from "./terminal-workspace.module.css";

interface WorkspaceResponse {
  status?: SandboxGitStatus;
  error?: string;
}

interface DiffResponse {
  diff?: SandboxGitDiff;
  error?: string;
}

interface PullRequestResponse {
  pushed?: SandboxPushedBranch;
  pullRequest?: {
    number: number;
    htmlUrl: string;
    head: string;
    base: string;
    title: string;
  };
  error?: string;
}

async function readJson<T extends { error?: string }>(response: Response) {
  const body = (await response.json().catch(() => null)) as T | null;
  if (!response.ok) throw new Error(body?.error || `Request failed (${response.status}).`);
  return body;
}

function hasChanges(status: SandboxGitStatus | null) {
  if (!status?.output.trim()) return false;
  return status.output
    .split("\n")
    .some((line) => line.trim().length > 0 && !line.startsWith("##"));
}

export function WorkspaceDelivery() {
  const [status, setStatus] = useState<SandboxGitStatus | null>(null);
  const [diff, setDiff] = useState<SandboxGitDiff | null>(null);
  const [message, setMessage] = useState("delivery idle");
  const [busy, setBusy] = useState<"refresh" | "deliver" | null>(null);
  const [title, setTitle] = useState("Apply sandbox changes");
  const [body, setBody] = useState("");
  const [pullRequestUrl, setPullRequestUrl] = useState<string | null>(null);
  const dirty = useMemo(() => hasChanges(status), [status]);
  const reviewed = status !== null || diff !== null;

  const refresh = useCallback(async () => {
    setBusy("refresh");
    setPullRequestUrl(null);
    setMessage("reading git workspace");
    try {
      const [statusBody, diffBody] = await Promise.all([
        readJson<WorkspaceResponse>(await fetch("/api/github/workspace", { cache: "no-store" })),
        readJson<DiffResponse>(await fetch("/api/github/workspace/diff", { cache: "no-store" })),
      ]);
      setStatus(statusBody?.status ?? null);
      setDiff(diffBody?.diff ?? null);
      setMessage(hasChanges(statusBody?.status ?? null) ? "changes ready for review" : "no changes to deliver");
    } catch (error) {
      setStatus(null);
      setDiff(null);
      setMessage(error instanceof Error ? error.message : "git workspace unavailable");
    } finally {
      setBusy(null);
    }
  }, []);

  const deliver = useCallback(async () => {
    setBusy("deliver");
    setMessage("pushing branch and opening pull request");
    setPullRequestUrl(null);
    try {
      const response = await fetch("/api/github/workspace/pr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
      const payload = await readJson<PullRequestResponse>(response);
      if (!payload?.pullRequest) throw new Error("Pull request was not returned.");
      setPullRequestUrl(payload.pullRequest.htmlUrl);
      setMessage(`pull request #${payload.pullRequest.number} opened`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "delivery failed");
    } finally {
      setBusy(null);
    }
  }, [body, title]);

  return (
    <aside className={styles.deliveryPanel} aria-label="GitHub delivery controls">
      <div className={styles.deliveryHeader}>
        <span role="status" aria-live="polite">{message}</span>
        <button type="button" disabled={busy !== null} onClick={() => void refresh()}>&gt;_review</button>
      </div>
      {reviewed ? (
        <>
          <div className={styles.deliveryBody}>
            <pre aria-label="Git status">{status?.output || "clone a repository, edit files, then review changes"}</pre>
            {diff?.output ? <pre aria-label="Git diff preview">{diff.output}</pre> : null}
            <label>
              <span>title</span>
              <input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label>
              <span>body</span>
              <textarea value={body} rows={3} onChange={(event) => setBody(event.target.value)} />
            </label>
          </div>
          <div className={styles.deliveryFooter}>
            <button type="button" disabled={busy !== null || !dirty || title.trim().length === 0} onClick={() => void deliver()}>
              &gt;_open pr
            </button>
            {pullRequestUrl ? <a href={pullRequestUrl} rel="noreferrer" target="_blank">view pull request</a> : null}
          </div>
        </>
      ) : null}
    </aside>
  );
}
