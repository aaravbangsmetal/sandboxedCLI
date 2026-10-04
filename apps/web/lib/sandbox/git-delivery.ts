export const SENSITIVE_FILES_SCRIPT = String.raw`
import re, sys
pattern = r"(^|/)\.env($|\.|rc$)|(^|/)\.(netrc|npmrc|pypirc|git-credentials)$|(^|/)id_(rsa|dsa|ed25519|ecdsa)($|\.)|\.(pem|p12|pfx|key)$|(^|/)credentials\.json$|(^|/)service-account.*\.json$|(^|/)\.docker/config\.json$|(^|/)\.kube/config$|(^|/)\.aws/|(^|/)config/gcloud/"
paths = sys.stdin.buffer.read().split(b"\0")
for raw in paths:
    path = raw.decode("utf-8", errors="replace")
    if re.search(pattern, path, re.I):
        if re.search(r"(^|/)\.env\.(example|sample|template)$", path, re.I):
            continue
        sys.exit(20)
`;

export const GIT_DELIVERY_SCRIPT = String.raw`
set -euo pipefail
repo="$(cat "/vercel/sandbox/.sandboxedcli/active_repo_path")" || exit 18
full_name="$(cat "/vercel/sandbox/.sandboxedcli/active_repo_full_name")" || exit 18
case "$repo" in /vercel/sandbox/repos/*) ;; *) exit 18 ;; esac
test -d "$repo/.git" || exit 18
[ "$full_name" = "$3" ] || exit 18
[ "$repo" = "$4" ] || exit 18
git -C "$repo" fetch origin "$5" >&2
base="$(git -C "$repo" rev-parse FETCH_HEAD)"
dirty="$(git -C "$repo" status --porcelain)"
pending="$(git -C "$repo" rev-list --count "$base..HEAD")"
if [ -z "$dirty" ] && [ "$pending" = 0 ]; then exit 19; fi
# Examine NUL-delimited names before changing the branch or staging state.
{
  git -C "$repo" diff --name-only -z --diff-filter=ACMRTUXB "$base"
  git -C "$repo" ls-files --others --exclude-standard -z
} | python3 -c "$6" || exit 20
if git -C "$repo" show-ref --verify --quiet "refs/heads/$1"; then
  [ "$(git -C "$repo" rev-parse "refs/heads/$1")" = "$(git -C "$repo" rev-parse HEAD)" ] || exit 22
  git -C "$repo" checkout "$1" >&2 || exit 21
else
  git -C "$repo" checkout -b "$1" >&2 || exit 21
fi
if [ -n "$dirty" ]; then
  git -C "$repo" add -A
  if ! git -C "$repo" diff --cached --quiet; then
    git -C "$repo" commit -m "$2" >&2
  fi
fi
# Keep the branch and commit on failure so the next delivery can retry the push.
git -C "$repo" push origin "HEAD:$1" >&2
commit_sha="$(git -C "$repo" rev-parse HEAD)"
printf "%s\n%s\n%s\n%s\n" "$3" "$1" "$5" "$commit_sha"
`;
