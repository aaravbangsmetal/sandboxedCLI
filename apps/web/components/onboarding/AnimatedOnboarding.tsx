"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

import styles from "./Onboarding.module.css";
import { OnboardingShell } from "./OnboardingShell";
import { TerminalSequence, type SequenceLine } from "./TerminalSequence";

type AnimatedOnboardingProps = Readonly<{
  lines: readonly SequenceLine[];
  completionMessage: string;
  destination: string;
  holdMs: number;
}>;

export function AnimatedOnboarding({
  lines,
  completionMessage,
  destination,
  holdMs,
}: AnimatedOnboardingProps) {
  const router = useRouter();
  const advance = useCallback(() => router.replace(destination), [destination, router]);

  return (
    <OnboardingShell wide>
      <section className={styles.copy} aria-label="Onboarding progress">
        <TerminalSequence
          lines={lines}
          completionMessage={completionMessage}
          holdMs={holdMs}
          onComplete={advance}
        />
      </section>
    </OnboardingShell>
  );
}
