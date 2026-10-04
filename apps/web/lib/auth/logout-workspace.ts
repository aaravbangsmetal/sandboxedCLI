export async function logoutWorkspace(fetcher: typeof fetch = fetch) {
  let pauseFailed = false;
  try {
    const pause = await fetcher("/api/sandbox/pause", {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
      signal: AbortSignal.timeout(30_000),
    });
    pauseFailed = !pause.ok && pause.status !== 404;
  } catch { pauseFailed = true; }

  // Pause needs the GitHub connection. Do not delete it until pause has finished.
  const response = await fetcher("/api/auth/session", {
    method: "DELETE", headers: { "content-type": "application/json" }, body: "{}",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error || "Sign out failed. Try again.");
  }
  return { pauseFailed };
}
