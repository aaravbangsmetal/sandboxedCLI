"use client";

import { useRouter } from "next/navigation";

import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import styles from "@/components/onboarding/Onboarding.module.css";

export default function HomePage() {
  const router = useRouter();

  return (
    <OnboardingShell>
      <section aria-labelledby="product-name">
        <h1 className={styles.brand} id="product-name">
          &gt;_sandboxed/<span className={styles.brandMuted}>cli</span>
        </h1>

        <p className={styles.copy}>
          <span className={`${styles.copyLine} ${styles.secondary}`}>&gt;_run your coding agents in</span>
          <span className={`${styles.copyLine} ${styles.indent}`}>isolated sandboxed virtual machines.</span>
          <span className={`${styles.copyLine} ${styles.muted}`}>&gt;_environments preconfigured;</span>
          <span className={`${styles.copyLine} ${styles.indent}`}>just log in to your agents.</span>
          <span className={`${styles.copyLine} ${styles.indent} ${styles.muted}`}>ready to spin up machines.</span>
        </p>

        <button className={styles.action} type="button" onClick={() => router.push("/auth")}>
          get started
        </button>

        <footer className={styles.footer}>
          <span className={styles.footerLine}>$_X;</span>
          <span className={styles.footerLine}>
            <a href="mailto:issues@sandboxedcli.xyz">@_issues@sandboxedcli.xyz</a>
          </span>
          <span className={styles.footerLine}>© 2026 <span className={styles.secondary}>sandboxedcli.xyz</span></span>
        </footer>
      </section>
    </OnboardingShell>
  );
}
