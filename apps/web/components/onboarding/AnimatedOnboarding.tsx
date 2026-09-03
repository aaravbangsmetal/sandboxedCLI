"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "./Onboarding.module.css";
import { OnboardingShell } from "./OnboardingShell";
import { TerminalSequence, type SequenceLine } from "./TerminalSequence";

type AnimatedOnboardingProps = Readonly<{
  lines: readonly SequenceLine[];
  completionMessage: string;
  destination: string;
  holdMs: number;
  prepareSandbox?: boolean;
}>;

export function AnimatedOnboarding({
  lines,
  completionMessage,
  destination,
  holdMs,
  prepareSandbox = false,
}: AnimatedOnboardingProps) {
  const router = useRouter();
  const started = useRef(false);
  const navigationTimer = useRef<number | null>(null);
  const [setupState, setSetupState] = useState<"idle" | "preparing" | "ready" | "error">("idle");
  const [setupError, setSetupError] = useState("");

  const prepare = useCallback(async () => {
    if (started.current) return;
    started.current = true;
    setSetupState("preparing");
    setSetupError("");
    try {
      const response = await fetch("/api/sandbox", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error || `Sandbox startup failed (${response.status}).`);
      setSetupState("ready");
      navigationTimer.current = window.setTimeout(() => router.replace(destination), 900);
    } catch (error) {
      started.current = false;
      setSetupState("error");
      setSetupError(error instanceof Error ? error.message : "Sandbox startup failed.");
    }
  }, [destination, router]);

  const advance = useCallback(() => {
    if (prepareSandbox) {
      void prepare();
      return;
    }
    router.replace(destination);
  }, [destination, prepare, prepareSandbox, router]);

  useEffect(
    () => () => {
      if (navigationTimer.current !== null) window.clearTimeout(navigationTimer.current);
    },
    [],
  );

  return (
    <OnboardingShell wide>
      <section className={styles.copy} aria-label="Onboarding progress">
        <TerminalSequence
          lines={lines}
          completionMessage={completionMessage}
          holdMs={holdMs}
          onComplete={advance}
        />
        {prepareSandbox && setupState !== "idle" ? (
          <p className={styles.sequenceLine} role="status" aria-live="polite">
            {setupState === "preparing" ? <><span className={styles.cursor} /> connecting to Vercel Sandbox</> : null}
            {setupState === "ready" ? <span className={styles.accent}>&gt;_sandbox_init!</span> : null}
            {setupState === "error" ? (
              <>
                <span className={styles.muted}>&gt;_{setupError}</span>{" "}
                <button className={styles.inlineAction} type="button" onClick={() => void prepare()}>retry</button>
              </>
            ) : null}
          </p>
        ) : null}
      </section>
    </OnboardingShell>
  );
}
