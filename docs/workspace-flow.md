# Workspace flow

The terminal workspace keeps the existing cloud-development flow visible and recoverable:

1. Sign in with GitHub and wait for the sandbox environment check to complete.
2. Select a repository, then clone it into the persistent sandbox. Clone changes directory in the current terminal instead of opening extra tabs. The active repository is shown above the terminal for the current browser session.
3. Watch each terminal's connection state. If reconnecting is exhausted, use `>_reconnect`; it recreates only that terminal.
4. Stopping a workspace preserves its files but resets running processes. Start it again before opening a terminal.
5. Use `>_review` before delivery. A clean workspace needs no PR; changed files can be committed, pushed to an optional branch name, and opened as a GitHub pull request. Truncated diffs should be finished in the terminal.

Repository, terminal, sandbox, and delivery failures expose a retry action. Load errors do not send the user back through GitHub login. These controls do not persist provider credentials in the browser.
