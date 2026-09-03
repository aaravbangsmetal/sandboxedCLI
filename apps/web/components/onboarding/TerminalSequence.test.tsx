import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TerminalSequence, type SequenceLine } from "./TerminalSequence";

const lines: readonly SequenceLine[] = [
  { segments: [{ text: ">_first" }] },
  { segments: [{ text: ">_done", tone: "accent" }] },
];

function setReducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

describe("TerminalSequence", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("types deterministically, announces only completion, and advances after its hold", async () => {
    vi.useFakeTimers();
    setReducedMotion(false);
    const onComplete = vi.fn();
    render(
      <TerminalSequence
        lines={lines}
        completionMessage="Setup complete"
        holdMs={700}
        charDelayMs={22}
        lineDelayMs={220}
        onComplete={onComplete}
      />,
    );

    const status = document.querySelector('[aria-live="polite"]');
    expect(status).toBeEmptyDOMElement();
    for (let character = 0; character < 13; character += 1) {
      act(() => vi.runOnlyPendingTimers());
    }
    expect(status).toHaveTextContent("Setup complete");
    expect(onComplete).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(700));
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("reveals immediately with reduced motion while retaining route timing", async () => {
    vi.useFakeTimers();
    setReducedMotion(true);
    const onComplete = vi.fn();
    render(
      <TerminalSequence
        lines={lines}
        completionMessage="Setup complete"
        holdMs={900}
        onComplete={onComplete}
      />,
    );

    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent("Setup complete");
    expect(onComplete).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(900));
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("cleans up pending timers when removed", () => {
    vi.useFakeTimers();
    setReducedMotion(false);
    const onComplete = vi.fn();
    const view = render(
      <TerminalSequence
        lines={lines}
        completionMessage="Setup complete"
        holdMs={700}
        onComplete={onComplete}
      />,
    );

    view.unmount();
    act(() => vi.runAllTimers());
    expect(onComplete).not.toHaveBeenCalled();
  });
});
