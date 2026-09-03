import type { ReactNode } from "react";

import styles from "./Onboarding.module.css";

type OnboardingShellProps = Readonly<{
  children: ReactNode;
  wide?: boolean;
}>;

export function OnboardingShell({ children, wide = false }: OnboardingShellProps) {
  return (
    <main className={styles.screen}>
      <div className={`${styles.content} ${wide ? styles.sequenceContent : ""}`}>{children}</div>
    </main>
  );
}
