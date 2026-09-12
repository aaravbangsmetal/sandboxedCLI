"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRouter } from "next/navigation";

import { createSandboxTerminalTransport } from "@/lib/terminal/create-transport";
import type { TerminalTransport } from "@/lib/terminal/transport";
import { type TerminalConnectionState } from "@/lib/terminal/vercel-transport";

import styles from "./terminal-workspace.module.css";
import { RepositoryPicker } from "./repository-picker";
import { SandboxControls } from "./sandbox-controls";
import { XtermPane } from "./xterm-pane";
import { WorkspaceDelivery } from "./workspace-delivery";

interface StoredTerminalTab {
  id: string;
  title: string;
}

interface TerminalTab extends StoredTerminalTab {
  transport: TerminalTransport;
  startupCommand?: string;
}

interface StoredWorkspace {
  version: 1;
  activeId: string;
  tabs: StoredTerminalTab[];
}

const STORAGE_KEY = "sandboxedcli.terminals.v1";
const DEFAULT_TAB = { id: "terminal-default", title: "$_terminal 1" } as const;
const MAX_TERMINALS = 8;
const MAX_LIVE_PTYS = 3;
const IDLE_PTY_MS = 45_000;
const REPOSITORY_DIRECTORY = /^\/vercel\/sandbox\/repos\/[A-Za-z0-9_.-]+$/;

function shellSingleQuote(value: string) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function changeDirectoryCommand(directory: string) {
  if (!REPOSITORY_DIRECTORY.test(directory)) return "";
  return `cd ${shellSingleQuote(directory)}\n`;
}

function isStoredWorkspace(value: unknown): value is StoredWorkspace {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredWorkspace>;
  return (
    candidate.version === 1 &&
    typeof candidate.activeId === "string" &&
    Array.isArray(candidate.tabs) &&
    candidate.tabs.length > 0 &&
    candidate.tabs.length <= MAX_TERMINALS &&
    candidate.tabs.every(
      (tab) =>
        tab &&
        typeof tab.id === "string" &&
        /^[a-z0-9][a-z0-9-]{0,63}$/.test(tab.id) &&
        typeof tab.title === "string",
    )
  );
}

function keepLivePtys(ids: Set<string>, activeId: string) {
  const next = new Set<string>([activeId]);
  for (const id of ids) {
    if (next.size >= MAX_LIVE_PTYS) break;
    next.add(id);
  }
  return next;
}

function nextTitle(tabs: readonly StoredTerminalTab[]) {
  const used = new Set(
    tabs.map((tab) => Number.parseInt(tab.title.replace("$_terminal ", ""), 10)).filter(Number.isFinite),
  );
  let number = 1;
  while (used.has(number)) number += 1;
  return `$_terminal ${number}`;
}

export function TerminalWorkspace() {
  const router = useRouter();
  const tabButtons = useRef(new Map<string, HTMLButtonElement>());
  const logout = useCallback(async () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem("sandboxedcli.active-repository.v1");
      const pause = fetch("/api/sandbox/pause", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
        keepalive: true,
      });
      const session = fetch("/api/auth/session", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: "{}",
        keepalive: true,
      });
      const [pauseResult] = await Promise.allSettled([pause, session]);
      const pauseFailed =
        pauseResult.status === "rejected" ||
        (pauseResult.status === "fulfilled" && !pauseResult.value.ok);
      router.replace(pauseFailed ? "/auth?notice=workspace_pause_failed" : "/auth");
    } catch {
      router.replace("/auth");
    }
  }, [router]);
  const [connectionStates, setConnectionStates] = useState<Record<string, TerminalConnectionState>>({});
  const createTransport = useCallback(
    (id: string): TerminalTransport =>
      createSandboxTerminalTransport(id, {
        onLogout: logout,
        onStateChange: (state) => {
          setConnectionStates((current) => ({ ...current, [id]: state }));
        },
      }),
    [logout],
  );
  const materialize = useCallback(
    (tab: StoredTerminalTab): TerminalTab => ({ ...tab, transport: createTransport(tab.id) }),
    [createTransport],
  );
  const [tabs, setTabs] = useState<TerminalTab[]>(() => [materialize(DEFAULT_TAB)]);
  const [activeId, setActiveId] = useState<string>(DEFAULT_TAB.id);
  const [activatedIds, setActivatedIds] = useState<Set<string>>(() => new Set([DEFAULT_TAB.id]));
  const [hydrated, setHydrated] = useState(false);

  const refreshTransports = useCallback(() => {
    setTabs((current) =>
      current.map((tab) => {
        tab.transport.dispose();
        return { ...tab, transport: createTransport(tab.id) };
      }),
    );
  }, [createTransport]);

  const retryTerminal = useCallback(
    (id: string) => {
      setConnectionStates((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setTabs((current) =>
        current.map((tab) => {
          if (tab.id !== id) return tab;
          tab.transport.dispose();
          return { ...tab, transport: createTransport(tab.id) };
        }),
      );
    },
    [createTransport],
  );

  const pauseTransports = useCallback(() => {
    tabs.forEach((tab) => tab.transport.dispose());
  }, [tabs]);

  const destroyWorkspace = useCallback(() => {
    tabs.forEach((tab) => tab.transport.dispose());
    router.replace("/auth");
  }, [router, tabs]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as unknown;
        if (isStoredWorkspace(saved)) {
          const nextActive = saved.tabs.some((tab) => tab.id === saved.activeId)
            ? saved.activeId
            : saved.tabs[0].id;
          setTabs((current) => {
            current.forEach((tab) => tab.transport.dispose());
            return saved.tabs.map(materialize);
          });
          setActiveId(nextActive);
          setActivatedIds(new Set([nextActive]));
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [materialize]);

  useEffect(() => {
    if (!hydrated) return;
    const workspace: StoredWorkspace = {
      version: 1,
      activeId,
      tabs: tabs.map(({ id, title }) => ({ id, title })),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
  }, [activeId, hydrated, tabs]);

  const addTab = useCallback(
    (startupCommand?: string) => {
      if (tabs.length >= MAX_TERMINALS) return;
      const tab = materialize({
        id: `terminal-${crypto.randomUUID()}`,
        title: nextTitle(tabs),
      });
      setTabs((current) => [...current, { ...tab, startupCommand }]);
      setActiveId(tab.id);
      setActivatedIds((current) => keepLivePtys(new Set(current).add(tab.id), tab.id));
    },
    [materialize, tabs],
  );

  const openRepository = useCallback(
    (directory: string) => {
      const command = changeDirectoryCommand(directory);
      const current = tabs.find((tab) => tab.id === activeId) ?? tabs[0];
      if (command && current) current.transport.write(command);
    },
    [activeId, tabs],
  );

  const terminateRemoteTab = useCallback((terminalId: string) => {
    if (process.env.NEXT_PUBLIC_SANDBOX_TRANSPORT === "mock") return;
    void fetch("/api/sandbox/terminal", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ terminalId }),
      keepalive: true,
    });
  }, []);

  const closeTab = useCallback(
    (id: string) => {
      const closingIndex = tabs.findIndex((tab) => tab.id === id);
      const closingTab = tabs[closingIndex];
      if (!closingTab) return;

      closingTab.transport.dispose();
      terminateRemoteTab(closingTab.id);
      const remaining = tabs.filter((tab) => tab.id !== id);

      if (remaining.length === 0) {
        const replacement = materialize({
          id: `terminal-${crypto.randomUUID()}`,
          title: "$_terminal 1",
        });
        setTabs([replacement]);
        setActiveId(replacement.id);
        setActivatedIds(new Set([replacement.id]));
        return;
      }

      setTabs(remaining);
      if (id === activeId) {
        const replacement = remaining[Math.min(closingIndex, remaining.length - 1)];
        setActiveId(replacement.id);
        setActivatedIds((current) => {
          const next = new Set(current);
          next.delete(id);
          next.add(replacement.id);
          return next;
        });
        return;
      }
      setActivatedIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    },
    [activeId, materialize, tabs, terminateRemoteTab],
  );

  const selectAndFocusTab = useCallback((id: string) => {
    setActiveId(id);
    setActivatedIds((current) => keepLivePtys(new Set(current).add(id), id));
    requestAnimationFrame(() => tabButtons.current.get(id)?.focus());
  }, []);

  const handleTabKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>, id: string) => {
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
    const timer = window.setTimeout(() => {
      setActivatedIds((current) => {
        if (current.size <= 1) return current;
        return new Set([activeId]);
      });
    }, IDLE_PTY_MS);
    return () => window.clearTimeout(timer);
  }, [activeId]);

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
        <RepositoryPicker onRepositoryReady={openRepository} />
        <div className={styles.tabRow} role="tablist" aria-label="Open terminals" aria-orientation="horizontal">
          <div className={styles.tabs}>
            {tabs.map((tab) => (
              <div className={`${styles.tabWrap} ${tab.id === activeId ? styles.activeTab : ""}`} key={tab.id}>
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
                  onClick={() => selectAndFocusTab(tab.id)}
                  onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
                >
                  {tab.title}
                </button>
                <button className={styles.close} type="button" aria-label={`Close ${tab.title}`} onClick={() => closeTab(tab.id)}>×</button>
              </div>
            ))}
          </div>
          <button
            className={styles.newTab}
            type="button"
            aria-keyshortcuts="Meta+Shift+T Control+Shift+T"
            disabled={tabs.length >= MAX_TERMINALS}
            onClick={() => addTab()}
          >
            &gt;_new
          </button>
        </div>

        {hydrated && tabs.map((tab) => (
          <div
            className={styles.terminalPanel}
            id={`terminal-panel-${tab.id}`}
            key={tab.id}
            role="tabpanel"
            aria-labelledby={`terminal-tab-${tab.id}`}
            hidden={tab.id !== activeTab.id}
          >
            <p className={styles.connectionStatus} role="status" aria-live="polite">
              terminal {connectionStates[tab.id] ?? (activatedIds.has(tab.id) ? "connecting" : "idle")}
            </p>
            {connectionStates[tab.id] === "error" || connectionStates[tab.id] === "disconnected" ? (
              <button className={styles.retryTerminal} type="button" onClick={() => retryTerminal(tab.id)}>
                &gt;_reconnect
              </button>
            ) : null}
            {activatedIds.has(tab.id) ? (
              <XtermPane
                transport={tab.transport}
                label={`${tab.title} interactive cloud terminal`}
                startupCommand={tab.startupCommand}
              />
            ) : null}
          </div>
        ))}
        {!hydrated && <div className={styles.terminalPanel} aria-label="Loading cloud terminal" />}

        <SandboxControls
          onPause={pauseTransports}
          onResume={refreshTransports}
          onDestroy={destroyWorkspace}
        />
        <WorkspaceDelivery />

        <footer className={styles.footer}>
          <span>$_X;</span>
          <a href="mailto:issues@sandboxedcli.xyz">@_issues@sandboxedcli.xyz</a>
          <button type="button" aria-keyshortcuts="Meta+Shift+T Control+Shift+T" onClick={() => addTab()}>⌘⇧T new terminal</button>
          <span>© 2026 <span className={styles.dark}>sandboxedcli.xyz</span></span>
          <button className={styles.logout} type="button" onClick={logout}>$_logout →</button>
        </footer>
      </section>
    </main>
  );
}
