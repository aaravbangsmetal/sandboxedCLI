# del-loop plan

Fixes from the control-plane review, landed as small commits on `del-loop` (from `main`).

## Safety

1. Map GitHub API failures to 401/403/404/429 instead of a generic 500.
2. Treat invalid sandbox health JSON as degraded, not a crash.
3. Clone by fetching one repository from GitHub, not paging the whole list.
4. Block delivery onto the default branch; re-resolve the active repo against GitHub before push/PR; refuse staging obvious secret files.
5. Hold terminal open/kill on the same mutation lock as clone/pause/destroy.

## Auth and cost

6. Compare mutation `Origin` to known site hosts, not client-supplied `x-forwarded-host`.
7. Redirect `/setup` and `/terminal` when there is no GitHub session.
8. Store GitHub’s granted scopes; delete the stored connection on logout; treat GitHub 401 as re-auth.
9. Cap sandbox lease extensions and no-op extend on a stopped VM.

## UI and abuse

10. Connect a terminal only after that tab is selected; fix reconnect copy; keep clone from opening extra tabs.
11. Rate-limit clone, terminal open, extend, and pull-request delivery per user.
12. Remove unused workspace-cookie identity; if a branch is pushed but the PR fails, return the pushed ref.

Rotating `SANDBOX_SESSION_SECRET` still remaps sandbox names. Do not rotate it in production without migrating live workspaces.
