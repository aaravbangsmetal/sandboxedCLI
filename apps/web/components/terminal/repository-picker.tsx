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

export function RepositoryPicker() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("checking github");

  const selectedRepo = useMemo(
    () => repositories.find((repository) => repository.fullName === selected),
    [repositories, selected],
  );

  const loadRepositories = useCallback(async () => {
    setMessage("checking github");
    const session = await readJson<SessionResponse>(
      await fetch("/api/auth/session", { cache: "no-store" }),
    );
    if (!session?.authenticated) {
      setAuthenticated(false);
      setMessage("github login required");
      return;
    }

    setAuthenticated(true);
    setMessage(`github connected${session.user?.login ? ` as ${session.user.login}` : ""}`);
    const repos = await readJson<ReposResponse>(await fetch("/api/github/repos", { cache: "no-store" }));
    const nextRepositories = repos?.repositories ?? [];
    setRepositories(nextRepositories);
    setSelected((current) =>
      nextRepositories.some((repository) => repository.fullName === current)
        ? current
        : nextRepositories[0]?.fullName ?? "",
    );
    if (nextRepositories.length === 0) setMessage("no repositories found");
  }, []);

  useEffect(() => {
    let active = true;
    void loadRepositories().catch((error) => {
      if (!active) return;
      setAuthenticated(false);
      setMessage(error instanceof Error ? error.message : "github unavailable");
    });
    return () => {
      active = false;
    };
  }, [loadRepositories]);

  const cloneRepository = useCallback(async () => {
    if (!selectedRepo) return;
    setBusy(true);
    setMessage(`cloning ${selectedRepo.fullName}`);
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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "clone failed");
    } finally {
      setBusy(false);
    }
  }, [selectedRepo]);

  return (
    <div className={styles.repoBar} aria-label="GitHub repository controls">
      <span className={styles.repoStatus} role="status" aria-live="polite">
        {message}
      </span>
      {authenticated === false ? (
        <a href="/api/auth/github">&gt;_login github</a>
      ) : (
        <>
          <select
            aria-label="GitHub repository"
            disabled={busy || repositories.length === 0}
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            {repositories.map((repository) => (
              <option key={repository.id} value={repository.fullName}>
                {repository.fullName}
              </option>
            ))}
          </select>
          <button type="button" disabled={busy || !selectedRepo} onClick={() => void cloneRepository()}>
            &gt;_clone
          </button>
        </>
      )}
    </div>
  );
}
