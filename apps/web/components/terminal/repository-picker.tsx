"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { GitHubRepository } from "@/lib/github/client";

import styles from "./terminal-workspace.module.css";

interface SessionResponse {
  authenticated: boolean;
  user: { login: string } | null;
}

interface ReposResponse {
  repositories?: GitHubRepository[];
  error?: string;
}

interface CloneResponse {
  clone?: {
    fullName: string;
    branch: string;
    directory: string;
    alreadyPresent: boolean;
  };
  error?: string;
}

async function readJson<T>(response: Response) {
  const body = (await response.json().catch(() => null)) as T | null;
  if (!response.ok) {
    const error = body && typeof body === "object" && "error" in body ? String(body.error) : "";
    throw new Error(error || `Request failed (${response.status}).`);
  }
  return body;
}

interface RepositoryPickerProps {
  onRepositoryReady: (directory: string) => void;
}

const ACTIVE_REPOSITORY_KEY = "sandboxedcli.active-repository.v1";

export function RepositoryPicker({ onRepositoryReady }: RepositoryPickerProps) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [selected, setSelected] = useState("");
  const [activeRepository, setActiveRepository] = useState(() =>
    typeof window === "undefined" ? "" : sessionStorage.getItem(ACTIVE_REPOSITORY_KEY) ?? "",
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failedAction, setFailedAction] = useState<"load" | "clone" | null>(null);
  const [message, setMessage] = useState("checking github");

  const selectedRepo = useMemo(
    () => repositories.find((repository) => repository.fullName === selected),
    [repositories, selected],
  );

  const loadRepositories = useCallback(async () => {
    setLoading(true);
    setFailedAction(null);
    setMessage("checking github");
    try {
      const session = await readJson<SessionResponse>(
        await fetch("/api/auth/session", { cache: "no-store" }),
      );
      if (!session?.authenticated) {
        setAuthenticated(false);
        setRepositories([]);
        setSelected("");
        setMessage("github login required");
        return;
      }

      setAuthenticated(true);
      setMessage(`github connected${session.user?.login ? ` as ${session.user.login}` : ""} · loading repositories`);
      const repos = await readJson<ReposResponse>(await fetch("/api/github/repos", { cache: "no-store" }));
      const nextRepositories = repos?.repositories ?? [];
      setRepositories(nextRepositories);
      setSelected((current) => {
        if (nextRepositories.some((repository) => repository.fullName === current)) return current;
        const stored = sessionStorage.getItem(ACTIVE_REPOSITORY_KEY) ?? "";
        if (stored && nextRepositories.some((repository) => repository.fullName === stored)) return stored;
        return nextRepositories[0]?.fullName ?? "";
      });
      setMessage(nextRepositories.length === 0 ? "no repositories found" : `${nextRepositories.length} repositories ready`);
    } catch (error) {
      setFailedAction("load");
      setMessage(error instanceof Error ? error.message : "github unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRepositories();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadRepositories]);

  const cloneRepository = useCallback(async () => {
    if (!selectedRepo) return;
    setBusy(true);
    setFailedAction(null);
    setMessage(`cloning ${selectedRepo.fullName} · opening workspace`);
    try {
      const body = await readJson<CloneResponse>(
        await fetch("/api/github/repos/clone", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ fullName: selectedRepo.fullName }),
        }),
      );
      if (!body?.clone) throw new Error("Clone did not return a workspace path.");
      setMessage(
        body.clone.alreadyPresent
          ? `${body.clone.fullName} already at ${body.clone.directory}`
          : `${body.clone.fullName} ready at ${body.clone.directory}`,
      );
      setActiveRepository(body.clone.fullName);
      sessionStorage.setItem(ACTIVE_REPOSITORY_KEY, body.clone.fullName);
      onRepositoryReady(body.clone.directory);
    } catch (error) {
      setFailedAction("clone");
      setMessage(error instanceof Error ? error.message : "clone failed");
    } finally {
      setBusy(false);
    }
  }, [onRepositoryReady, selectedRepo]);

  const refreshRepositories = useCallback(() => {
    void loadRepositories();
  }, [loadRepositories]);

  return (
    <div className={styles.repoBar} aria-busy={loading || busy} aria-label="GitHub repository controls">
      <span className={styles.repoStatus} role="status" aria-live="polite">
        {message}
      </span>
      {activeRepository ? <span className={styles.repoContext}>active: {activeRepository}</span> : null}
      {authenticated === false ? (
        <a href="/api/auth/github">&gt;_login github</a>
      ) : (
        <>
          <select
            aria-label="GitHub repository"
            disabled={loading || busy || repositories.length === 0}
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            {repositories.map((repository) => (
              <option key={repository.id} value={repository.fullName}>
                {repository.fullName}
              </option>
            ))}
          </select>
          <button type="button" disabled={loading || busy} onClick={refreshRepositories}>
            &gt;_refresh
          </button>
          <button type="button" disabled={loading || busy || !selectedRepo} onClick={() => void cloneRepository()}>
            &gt;_clone
          </button>
          {failedAction ? (
            <button
              type="button"
              disabled={loading || busy}
              onClick={() => void (failedAction === "load" ? loadRepositories() : cloneRepository())}
            >
              &gt;_retry {failedAction}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
