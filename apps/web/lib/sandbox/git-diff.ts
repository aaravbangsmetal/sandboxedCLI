// Drain Git's stdout after reaching the limit so large diffs cannot fail with SIGPIPE.
export const GIT_DIFF_SCRIPT = `
import json, subprocess, sys
repo = sys.argv[1]
limit = 120000
output = bytearray()
total = 0

def append(data):
    global total
    total += len(data)
    output.extend(data[:max(0, limit - len(output))])

def git(*args):
    process = subprocess.Popen(["git", "-C", repo, *args], stdout=subprocess.PIPE)
    while True:
        chunk = process.stdout.read(65536)
        if not chunk:
            break
        append(chunk)
    if process.wait() != 0:
        sys.exit(process.returncode)

git("diff", "--no-ext-diff", "--no-textconv", "--stat", "HEAD")
git("diff", "--no-ext-diff", "--no-textconv", "--color=never", "HEAD")
append(b"\\n-- untracked --\\n")
git("ls-files", "--others", "--exclude-standard")
print(json.dumps({"repositoryDirectory": repo, "output": output.decode("utf-8", errors="replace"), "truncated": total > limit}))
`;
