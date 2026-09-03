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
      { text: ">_restoring filesystem; ", tone: "muted" },
      { text: "setting_access" },
    ],
  },
  { segments: [{ text: ">_universal image selected" }] },
  {
    segments: [
      { text: ">_opening controller; ", tone: "muted" },
      { text: "issuing_pty" },
    ],
  },
  { segments: [{ text: ">_terminal transport ready" }] },
  { segments: [{ text: ">_requesting persistent workspace", tone: "muted" }] },
] as const;

export default function SetupPage() {
  return (
    <AnimatedOnboarding
      lines={setupLines}
      completionMessage="Sandbox preparation requested"
      destination="/terminal"
      holdMs={0}
      prepareSandbox
    />
  );
}
