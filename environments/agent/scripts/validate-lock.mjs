import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const agentRoot = join(dirname(scriptPath), "..");
const repoRoot = join(agentRoot, "..", "..");
const manifest = JSON.parse(readFileSync(join(agentRoot, "versions.json"), "utf8"));
const dockerfile = readFileSync(join(agentRoot, "Dockerfile"), "utf8");
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function dockerArg(name) {
  const match = dockerfile.match(new RegExp(`^ARG ${name}=([^\\n]+)$`, "m"));
  return match?.[1];
}

function assertDockerArg(name, expected) {
  assert(
    dockerArg(name) === expected,
    `Dockerfile ARG ${name} must be ${expected}, got ${dockerArg(name) || "missing"}`,
  );
}

function assertExecutable(path) {
  const mode = statSync(path).mode;
  assert((mode & 0o111) !== 0, `${path.replace(`${repoRoot}/`, "")} must be executable`);
}

assert(
  /^[^@]+@sha256:[a-f0-9]{64}$/.test(manifest.baseImage),
  "baseImage must be pinned by sha256 digest",
);
assert(manifest.platform === "linux/amd64", "platform must be linux/amd64");
assert(/^[0-9]{8}T[0-9]{6}Z$/.test(manifest.ubuntuSnapshot), "ubuntuSnapshot must be immutable");
assert(/^[a-f0-9]{64}$/.test(manifest.node.sha256), "node sha256 must be pinned");
assert(/^[a-f0-9]{64}$/.test(manifest.githubCli.sha256), "GitHub CLI sha256 must be pinned");

for (const packageName of [
  "@openai/codex",
  "@anthropic-ai/claude-code",
  "opencode-ai",
  "pnpm",
  "vercel",
]) {
  const packageLock = manifest.npmPackages[packageName];
  assert(packageLock, `${packageName} must be pinned`);
  assert(packageLock?.version, `${packageName} version must be present`);
  assert(/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(packageLock?.integrity || ""), `${packageName} integrity must be pinned`);
}

assertDockerArg("BASE_IMAGE", manifest.baseImage);
assertDockerArg("UBUNTU_SNAPSHOT", manifest.ubuntuSnapshot);
assertDockerArg("NODE_VERSION", manifest.node.version);
assertDockerArg("NODE_SHA256", manifest.node.sha256);
assertDockerArg("PNPM_VERSION", manifest.npmPackages.pnpm.version);
assertDockerArg("GH_VERSION", manifest.githubCli.version);
assertDockerArg("GH_SHA256", manifest.githubCli.sha256);
assertDockerArg("CODEX_VERSION", manifest.npmPackages["@openai/codex"].version);
assertDockerArg("CLAUDE_CODE_VERSION", manifest.npmPackages["@anthropic-ai/claude-code"].version);
assertDockerArg("OPENCODE_VERSION", manifest.npmPackages["opencode-ai"].version);

for (const scriptName of [
  "build-image.sh",
  "publish-vcr.sh",
  "sandboxed-env.sh",
  "sandboxed-health.sh",
  "verify-image.sh",
]) {
  assertExecutable(join(agentRoot, "scripts", scriptName));
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`env lock validation failed: ${failure}`);
  process.exit(1);
}

console.log("environment lock validation passed");
