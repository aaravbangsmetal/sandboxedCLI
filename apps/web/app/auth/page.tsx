import { AnimatedOnboarding } from "@/components/onboarding/AnimatedOnboarding";
import type { SequenceLine } from "@/components/onboarding/TerminalSequence";

const authenticationLines: readonly SequenceLine[] = [
  {
    segments: [
      { text: ">_sandboxed/cli " },
      { text: "executing commands", tone: "primary" },
    ],
  },
  {
    segments: [
      { text: ">_user not authenticated; ", tone: "muted" },
      { text: "action req_auth" },
    ],
  },
  {
    segments: [
      { text: ">_gh_login ", tone: "muted" },
      { text: "limit_repo/read_write_access" },
    ],
  },
  { segments: [{ text: ">_", tone: "muted" }] },
  {
    segments: [
      { text: ">_authentication successful " },
      { text: "✓", tone: "secondary" },
    ],
  },
] as const;

export default function AuthenticationPage() {
  return (
    <AnimatedOnboarding
      lines={authenticationLines}
      completionMessage="Authentication simulation complete"
      destination="/setup"
      holdMs={700}
    />
  );
}
