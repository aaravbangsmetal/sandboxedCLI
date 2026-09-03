import { expect, test } from "@playwright/test";
import path from "node:path";

const routes = [
  ["landing", "/", "get started"],
  ["authentication", "/auth", ">_authentication successful ✓"],
  ["setup", "/setup", ">_sandbox_init!"],
  ["terminal", "/terminal", "Cloud terminal workspace"],
] as const;

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: true,
        user: { login: "octocat" },
        scope: "repo",
      }),
    });
  });
  await page.route("**/api/github/repos", async (route) => {
    if (!route.request().url().endsWith("/api/github/repos")) return route.continue();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        repositories: [
          {
            id: 1,
            name: "hello-world",
            fullName: "octocat/hello-world",
            private: false,
            htmlUrl: "https://github.com/octocat/hello-world",
            cloneUrl: "https://github.com/octocat/hello-world.git",
            defaultBranch: "main",
            pushedAt: null,
            permissions: { admin: false, maintain: false, push: true, triage: false, pull: true },
          },
        ],
      }),
    });
  });
  await page.route("**/api/github/repos/clone", async (route) => {
    if (!route.request().url().endsWith("/api/github/repos/clone")) return route.continue();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        clone: {
          fullName: "octocat/hello-world",
          branch: "main",
          directory: "/vercel/sandbox/repos/octocat__hello-world",
          alreadyPresent: false,
        },
      }),
    });
  });
  await page.route("**/api/sandbox/environment", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        configured: true,
        environment: {
          status: "ok",
          workspace: "/vercel/sandbox",
          stateDirectory: "/vercel/sandbox/.sandboxedcli",
          image: "sandboxed-cli-agent:e2e",
          checks: [],
        },
      }),
    });
  });
  await page.route("**/api/sandbox", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        configured: true,
        sandbox: {
          name: "sandboxed-cli-e2e",
          state: "running",
          persistent: true,
          filesystemPreserved: true,
          processMemoryPreserved: false,
        },
      }),
    });
  });
});

for (const [name, route, marker] of routes) {
  test(`captures ${name} reference screen`, async ({ page }, testInfo) => {
    await page.goto(route);

    if (name === "landing") {
      await expect(page.getByRole("button", { name: marker })).toBeVisible();
    } else if (name === "terminal") {
      await expect(page.getByRole("region", { name: marker })).toBeVisible();
    } else {
      await expect(page.getByText(marker, { exact: true })).toBeVisible();
    }

    const size = testInfo.project.name.startsWith("mobile") ? "390x844" : "1548x1052";
    await page.screenshot({
      path: path.resolve(process.cwd(), "../../artifacts/interface", `${name}-${size}.png`),
      fullPage: false,
    });
  });
}
