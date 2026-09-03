import { AnimatedOnboarding } from "@/components/onboarding/AnimatedOnboarding";
import type { SequenceLine } from "@/components/onboarding/TerminalSequence";

const setupLines: readonly SequenceLine[] = [
  {
    segments: [
      { text: ">_starting vm; " },
      { text: "spinning_sandbox", tone: "muted" },
    ],
  },
  {
    segments: [
      { text: ">_installing dependencies; ", tone: "muted" },
      { text: "setting_access" },
    ],
  },
  { segments: [{ text: ">_dependencies installed" }] },
  {
    segments: [
      { text: ">_downloading packages; ", tone: "muted" },
      { text: "fetch_curl" },
    ],
  },
  { segments: [{ text: ">_28 packages downloaded" }] },
  { segments: [{ text: ">_sandbox_init!", tone: "accent" }] },
] as const;

export default function SetupPage() {
  return (
    <AnimatedOnboarding
      lines={setupLines}
      completionMessage="Mock sandbox setup complete"
      destination="/terminal"
      holdMs={900}
    />
  );
}
