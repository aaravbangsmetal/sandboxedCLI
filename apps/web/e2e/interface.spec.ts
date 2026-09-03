import { expect, test } from "@playwright/test";

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
    if (route.request().method() === "POST") {
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
      return;
    }
    await route.continue();
  });
});

test("completes the landing, authentication, setup, and terminal flow", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "get started" }).click();
  await expect(page).toHaveURL(/\/auth$/);
  await expect(page.getByText(">_authentication successful ✓", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/setup$/, { timeout: 2_000 });
  await expect(page.getByText(">_sandbox_init!", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/terminal$/, { timeout: 2_000 });
  await expect(page.getByRole("region", { name: /interactive cloud terminal/ })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("button", { name: "get started" })).toBeVisible();
});

test("supports direct routes and browser Back navigation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "get started" }).press("Space");
  await expect(page).toHaveURL(/\/auth$/);
  await page.goBack();
  await expect(page.getByRole("button", { name: "get started" })).toBeVisible();

  await page.goto("/auth");
  await expect(page.getByLabel("Terminal progress")).toBeVisible();
  await page.goto("/setup");
  await expect(page.getByLabel("Terminal progress")).toBeVisible();
  await page.goto("/terminal");
  await expect(page.getByRole("tab", { name: "$_terminal 1" })).toBeVisible();
});

test("creates, selects, keyboard-navigates, and closes independent tabs", async ({ page }) => {
  await page.goto("/terminal");
  await page.getByRole("button", { name: ">_new" }).click();
  await expect(page.getByRole("tab", { name: "$_terminal 2" })).toHaveAttribute("aria-selected", "true");

  await page.getByRole("tab", { name: "$_terminal 2" }).press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "$_terminal 1" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "$_terminal 1" }).press("End");
  await expect(page.getByRole("tab", { name: "$_terminal 2" })).toHaveAttribute("aria-selected", "true");

  await page.getByRole("button", { name: "Close $_terminal 2" }).click();
  await page.getByRole("button", { name: "Close $_terminal 1" }).click();
  await expect(page.getByRole("tab", { selected: true })).toHaveCount(1);
});

test("preserves mock command history independently between tabs", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith("mobile"), "xterm transcript assertion is desktop-only");
  await page.goto("/terminal");
  const input = page.locator(".xterm-helper-textarea");
  const activeTranscript = () => page.getByRole("tabpanel").locator(".xterm-accessibility-tree");
  await input.pressSequentially("pwd");
  await input.press("Enter");
  await expect(activeTranscript()).toContainText("/workspace/sandboxedcli");

  await page.getByRole("button", { name: ">_new" }).click();
  await expect(activeTranscript()).not.toContainText("/workspace/sandboxedcli");
  await page.getByRole("tab", { name: "$_terminal 1" }).click();
  await expect(activeTranscript()).toContainText("/workspace/sandboxedcli");
});

test("creates a terminal with keyboard or touch controls and logs out", async ({ page }, testInfo) => {
  await page.goto("/terminal");
  if (testInfo.project.name.startsWith("mobile")) {
    await page.getByRole("button", { name: ">_new" }).click();
  } else {
    await page.keyboard.press("Control+Shift+T");
  }
  await expect(page.getByRole("tab")).toHaveCount(2);
  await page.getByRole("button", { name: "$_logout →" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("fits the mobile viewport and keeps the footer readable", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "mobile-only layout assertion");
  await page.goto("/terminal");
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    footerSize: getComputedStyle(document.querySelector("footer")!).fontSize,
  }));

  expect(metrics.scrollWidth).toBe(metrics.clientWidth);
  expect(Number.parseFloat(metrics.footerSize)).toBeGreaterThanOrEqual(14);
});
