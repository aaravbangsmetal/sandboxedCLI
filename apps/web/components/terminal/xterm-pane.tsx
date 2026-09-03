"use client";

import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";

import type { TerminalTransport } from "@/lib/terminal/transport";

import styles from "./terminal-workspace.module.css";

interface XtermPaneProps {
  transport: TerminalTransport;
  label: string;
}

export function XtermPane({ transport, label }: XtermPaneProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const terminal = new Terminal({
      allowProposedApi: false,
      convertEol: true,
      cursorBlink: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      cursorStyle: "block",
      fontFamily: '"Cascadia Mono", "SFMono-Regular", Consolas, monospace',
      fontSize: 14,
      fontWeight: "400",
      lineHeight: 1.35,
      screenReaderMode: true,
      scrollback: 2_000,
      theme: {
        background: "#f8f8f8",
        foreground: "#1a1a1a",
        cursor: "#1a1a1a",
        cursorAccent: "#f8f8f8",
        selectionBackground: "#d9eafb",
        black: "#1a1a1a",
        brightBlack: "#a2a2a2",
        blue: "#438ed6",
        brightBlue: "#438ed6",
        white: "#f8f8f8",
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(host);

    const fit = () => {
      try {
        fitAddon.fit();
        transport.resize(terminal.cols, terminal.rows);
      } catch {
        // A resize can race the panel being removed while switching tabs.
      }
    };

    transport.connect((data) => terminal.write(data));
    const inputSubscription = terminal.onData((data) => transport.write(data));
    const resizeObserver = new ResizeObserver(fit);
    resizeObserver.observe(host);
    requestAnimationFrame(() => {
      fit();
      terminal.focus();
    });

    return () => {
      resizeObserver.disconnect();
      inputSubscription.dispose();
      transport.dispose();
      terminal.dispose();
    };
  }, [transport]);

  return <div ref={hostRef} className={styles.xtermHost} role="region" aria-label={label} />;
}
