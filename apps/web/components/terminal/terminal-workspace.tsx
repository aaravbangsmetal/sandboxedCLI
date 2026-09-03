"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
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
  const tabButtons = useRef(new Map<number, HTMLButtonElement>());
  const logout = useCallback(() => router.replace("/"), [router]);
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
      const closingIndex = tabs.findIndex((tab) => tab.id === id);
      const closingTab = tabs[closingIndex];
      if (!closingTab) return;

      closingTab.transport.dispose();
      const remaining = tabs.filter((tab) => tab.id !== id);

      if (remaining.length === 0) {
        const replacement = createTab();
        setTabs([replacement]);
        setActiveId(replacement.id);
        return;
      }

      setTabs(remaining);
      if (id === activeId) {
        const replacement = remaining[Math.min(closingIndex, remaining.length - 1)];
        setActiveId(replacement.id);
      }
    },
    [activeId, createTab, tabs],
  );

  const selectAndFocusTab = useCallback((id: number) => {
    setActiveId(id);
    requestAnimationFrame(() => tabButtons.current.get(id)?.focus());
  }, []);

  const handleTabKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>, id: number) => {
      const currentIndex = tabs.findIndex((tab) => tab.id === id);
      let targetIndex: number | null = null;

      if (event.key === "ArrowRight") targetIndex = (currentIndex + 1) % tabs.length;
      if (event.key === "ArrowLeft") targetIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      if (event.key === "Home") targetIndex = 0;
      if (event.key === "End") targetIndex = tabs.length - 1;
      if (event.key === "Delete") {
        event.preventDefault();
        closeTab(id);
        return;
      }

      if (targetIndex === null) return;
      event.preventDefault();
      selectAndFocusTab(tabs[targetIndex].id);
    },
    [closeTab, selectAndFocusTab, tabs],
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
        <div
          className={styles.tabRow}
          role="tablist"
          aria-label="Open terminals"
          aria-orientation="horizontal"
        >
          <div className={styles.tabs}>
            {tabs.map((tab) => (
              <div
                className={`${styles.tabWrap} ${tab.id === activeId ? styles.activeTab : ""}`}
                key={tab.id}
              >
                <button
                  className={styles.tab}
                  id={`terminal-tab-${tab.id}`}
                  ref={(element) => {
                    if (element) tabButtons.current.set(tab.id, element);
                    else tabButtons.current.delete(tab.id);
                  }}
                  type="button"
                  role="tab"
                  aria-controls={`terminal-panel-${tab.id}`}
                  aria-selected={tab.id === activeId}
                  tabIndex={tab.id === activeId ? 0 : -1}
                  onClick={() => setActiveId(tab.id)}
                  onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
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
          <button
            className={styles.newTab}
            type="button"
            aria-keyshortcuts="Meta+Shift+T Control+Shift+T"
            onClick={addTab}
          >
            &gt;_new
          </button>
        </div>

        {tabs.map((tab) => (
          <div
            className={styles.terminalPanel}
            id={`terminal-panel-${tab.id}`}
            key={tab.id}
            role="tabpanel"
            aria-labelledby={`terminal-tab-${tab.id}`}
            hidden={tab.id !== activeTab.id}
          >
            <XtermPane
              transport={tab.transport}
              label={`${tab.title} interactive mock terminal`}
            />
          </div>
        ))}

        <footer className={styles.footer}>
          <span>$_X;</span>
          <a href="mailto:issues@sandboxedcli.xyz">@_issues@sandboxedcli.xyz</a>
          <button type="button" aria-keyshortcuts="Meta+Shift+T Control+Shift+T" onClick={addTab}>⌘⇧T new terminal</button>
          <span>© 2026 <span className={styles.dark}>sandboxedcli.xyz</span></span>
          <button className={styles.logout} type="button" onClick={logout}>$_logout →</button>
        </footer>
      </section>
    </main>
  );
}
