"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import styles from "./Onboarding.module.css";
import { OnboardingShell } from "./OnboardingShell";
import { TerminalSequence, type SequenceLine } from "./TerminalSequence";

interface SessionResponse {
  authenticated: boolean;
  user: { login: string } | null;
  error?: string;
}

const authenticatedLines: readonly SequenceLine[] = [
  {
    segments: [
      { text: ">_sandboxed/cli " },
      { text: "executing commands", tone: "primary" },
    ],
  },
  {
    segments: [
      { text: ">_github session found; ", tone: "muted" },
      { text: "using_scoped_access" },
    ],
  },
  {
    segments: [
      { text: ">_authentication successful " },
      { text: "✓", tone: "secondary" },
    ],
  },
] as const;

export function GitHubAuthGate() {
  const [state, setState] = useState<"checking" | "authenticated" | "unauthenticated" | "error">("checking");
  const [login, setLogin] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as SessionResponse | null;
        if (!response.ok) throw new Error(body?.error || "GitHub session check failed.");
        if (!active) return;
        setLogin(body?.user?.login ?? "");
        setState(body?.authenticated ? "authenticated" : "unauthenticated");
      })
      .catch((reason) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "GitHub session check failed.");
        setState("error");
      });
    return () => {
      active = false;
    };
  }, []);

  if (state === "authenticated") {
    return (
      <OnboardingShell wide>
        <section className={styles.copy} aria-label="GitHub authentication complete">
          <TerminalSequence
            lines={authenticatedLines}
            completionMessage={`GitHub authenticated${login ? ` as ${login}` : ""}`}
            holdMs={700}
            onComplete={() => {
              window.location.replace("/setup");
            }}
          />
        </section>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell wide>
      <section className={styles.copy} aria-label="GitHub authentication">
        <p className={styles.sequenceLine}>
          &gt;_sandboxed/cli <span>executing commands</span>
        </p>
        <p className={styles.sequenceLine}>
          <span className={styles.muted}>
            &gt;_{state === "checking" ? "checking github session" : "user not authenticated"};
          </span>{" "}
          <span>{state === "checking" ? "wait_for_auth" : "action req_auth"}</span>
        </p>
        {state === "unauthenticated" ? (
          <Link className={styles.action} href="/api/auth/github">
            login github
          </Link>
        ) : null}
        {state === "error" ? (
          <p className={styles.sequenceLine}>
            <span className={styles.muted}>&gt;_{error}</span>{" "}
            <Link className={styles.inlineAction} href="/api/auth/github">
              retry
            </Link>
          </p>
        ) : null}
      </section>
    </OnboardingShell>
  );
}
