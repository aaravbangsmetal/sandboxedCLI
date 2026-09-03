"use client";

import { useEffect, useMemo, useState } from "react";

import styles from "./Onboarding.module.css";

export type SequenceTone = "primary" | "secondary" | "muted" | "accent";

export type SequenceSegment = Readonly<{
  text: string;
  tone?: SequenceTone;
}>;

export type SequenceLine = Readonly<{
  segments: readonly SequenceSegment[];
}>;

type TerminalSequenceProps = Readonly<{
  lines: readonly SequenceLine[];
  completionMessage: string;
  onComplete: () => void;
  holdMs: number;
  charDelayMs?: number;
  lineDelayMs?: number;
}>;

const toneClasses: Record<SequenceTone, string | undefined> = {
  primary: undefined,
  secondary: styles.secondary,
  muted: styles.muted,
  accent: styles.accent,
};

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);

    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return reducedMotion;
}

export function TerminalSequence({
  lines,
  completionMessage,
  onComplete,
  holdMs,
  charDelayMs = 22,
  lineDelayMs = 220,
}: TerminalSequenceProps) {
  const reducedMotion = useReducedMotion();
  const lineLengths = useMemo(
    () => lines.map((line) => line.segments.reduce((length, segment) => length + segment.text.length, 0)),
    [lines],
  );
  const totalCharacters = useMemo(
    () => lineLengths.reduce((total, length) => total + length, 0),
    [lineLengths],
  );
  const lineStarts = useMemo(
    () =>
      lineLengths.map((_, lineIndex) =>
        lineLengths.slice(0, lineIndex).reduce((total, length) => total + length, 0),
      ),
    [lineLengths],
  );
  const [visibleCharacters, setVisibleCharacters] = useState(0);

  useEffect(() => {
    if (reducedMotion) {
      const completionTimer = window.setTimeout(onComplete, holdMs);
      return () => window.clearTimeout(completionTimer);
    }

    if (visibleCharacters >= totalCharacters) {
      const completionTimer = window.setTimeout(onComplete, holdMs);
      return () => window.clearTimeout(completionTimer);
    }

    let runningTotal = 0;
    let atLineBoundary = false;
    for (const length of lineLengths) {
      runningTotal += length;
      if (visibleCharacters === runningTotal) {
        atLineBoundary = true;
        break;
      }
    }

    const timer = window.setTimeout(
      () => setVisibleCharacters((current) => Math.min(current + 1, totalCharacters)),
      atLineBoundary ? lineDelayMs : charDelayMs,
    );
    return () => window.clearTimeout(timer);
  }, [charDelayMs, holdMs, lineDelayMs, lineLengths, onComplete, reducedMotion, totalCharacters, visibleCharacters]);

  const renderedCharacters = reducedMotion ? totalCharacters : visibleCharacters;
  const activeLineIndex = lineStarts.findIndex(
    (lineStart, lineIndex) => renderedCharacters <= lineStart + lineLengths[lineIndex],
  );

  return (
    <div className={styles.sequence} aria-label="Terminal progress">
      {lines.map((line, lineIndex) => {
        const visibleOnLine = Math.max(
          0,
          Math.min(lineLengths[lineIndex], renderedCharacters - lineStarts[lineIndex]),
        );
        const showCursor = lineIndex === (activeLineIndex === -1 ? lines.length - 1 : activeLineIndex);

        let remaining = visibleOnLine;
        return (
          <p className={styles.sequenceLine} key={lineIndex} aria-hidden="true">
            {line.segments.map((segment, segmentIndex) => {
              const visibleText = segment.text.slice(0, remaining);
              remaining = Math.max(0, remaining - segment.text.length);
              return (
                <span className={toneClasses[segment.tone ?? "primary"]} key={segmentIndex}>
                  {visibleText}
                </span>
              );
            })}
            {showCursor ? <span className={styles.cursor} /> : null}
          </p>
        );
      })}
      <span className={styles.screenReaderStatus} aria-live="polite">
        {renderedCharacters >= totalCharacters ? completionMessage : ""}
      </span>
    </div>
  );
}
