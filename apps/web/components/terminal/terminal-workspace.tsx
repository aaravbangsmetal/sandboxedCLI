"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { MockTerminalTransport } from "@/lib/terminal/mock-transport";

import styles from "./terminal-workspace.module.css";
import { XtermPane } from "./xterm-pane";

interface TerminalTab {
  id: number;
  title: string;
  transport: MockTerminalTransport;
}

export function TerminalWorkspace() {
  const router = useRouter();
  const nextId = useRef(2);
  const logout = useCallback(() => router.push("/"), [router]);
  const createTab = useCallback((): TerminalTab => {
    const id = nextId.current++;
    return {
      id,
      title: `$_terminal ${id}`,
      transport: new MockTerminalTransport({ onLogout: logout }),
    };
  }, [logout]);
  const [tabs, setTabs] = useState<TerminalTab[]>(() => [
    {
      id: 1,
      title: "$_terminal 1",
      transport: new MockTerminalTransport({ onLogout: logout }),
    },
  ]);
  const [activeId, setActiveId] = useState(1);

  const addTab = useCallback(() => {
    const tab = createTab();
    setTabs((current) => [...current, tab]);
    setActiveId(tab.id);
  }, [createTab]);

  const closeTab = useCallback(
    (id: number) => {
      setTabs((current) => {
        const closingIndex = current.findIndex((tab) => tab.id === id);
        const remaining = current.filter((tab) => tab.id !== id);

        if (remaining.length === 0) {
          const replacement = createTab();
          setActiveId(replacement.id);
          return [replacement];
        }

        if (id === activeId) {
          const replacement = remaining[Math.min(closingIndex, remaining.length - 1)];
          setActiveId(replacement.id);
        }
        return remaining;
      });
    },
    [activeId, createTab],
  );

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "t") {
        event.preventDefault();
        addTab();
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [addTab]);

  const activeTab = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  return (
    <main className={styles.page}>
      <section className={styles.workspace} aria-label="Cloud terminal workspace">
        <div className={styles.tabRow} role="tablist" aria-label="Open terminals">
          <div className={styles.tabs}>
            {tabs.map((tab) => (
              <div
                className={`${styles.tabWrap} ${tab.id === activeId ? styles.activeTab : ""}`}
                key={tab.id}
              >
                <button
                  className={styles.tab}
                  id={`terminal-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-controls={`terminal-panel-${tab.id}`}
                  aria-selected={tab.id === activeId}
                  tabIndex={tab.id === activeId ? 0 : -1}
                  onClick={() => setActiveId(tab.id)}
                >
                  {tab.title}
                </button>
                <button
                  className={styles.close}
                  type="button"
                  aria-label={`Close ${tab.title}`}
                  onClick={() => closeTab(tab.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button className={styles.newTab} type="button" onClick={addTab}>
            &gt;_new
          </button>
        </div>

        <div
          className={styles.terminalPanel}
          id={`terminal-panel-${activeTab.id}`}
          role="tabpanel"
          aria-labelledby={`terminal-tab-${activeTab.id}`}
        >
          <XtermPane
            key={activeTab.id}
            transport={activeTab.transport}
            label={`${activeTab.title} interactive mock terminal`}
          />
        </div>

        <footer className={styles.footer}>
          <span>$_X;</span>
          <a href="mailto:issues@sandboxedcli.xyz">@_issues@sandboxedcli.xyz</a>
          <button type="button" onClick={addTab}>⌘⇧T new terminal</button>
          <span>© 2026 <span className={styles.dark}>sandboxedcli.xyz</span></span>
          <button className={styles.logout} type="button" onClick={logout}>$_logout →</button>
        </footer>
      </section>
    </main>
  );
}
