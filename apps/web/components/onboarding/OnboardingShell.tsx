import type { ReactNode } from "react";

import styles from "./Onboarding.module.css";

type OnboardingShellProps = Readonly<{
  children: ReactNode;
}>;

export function OnboardingShell({ children }: OnboardingShellProps) {
  return (
    <main className={styles.screen}>
      <div className={styles.content}>{children}</div>
    </main>
  );
}
