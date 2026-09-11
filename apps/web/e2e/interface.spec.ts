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
  await page.route("**/api/github/workspace", async (route) => {
    if (!route.request().url().endsWith("/api/github/workspace")) return route.continue();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        status: {
          repositoryDirectory: "/vercel/sandbox/repos/octocat__hello-world",
          output: "## main...origin/main\n M README.md\n",
        },
      }),
    });
  });
  await page.route("**/api/github/workspace/diff", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        diff: {
          repositoryDirectory: "/vercel/sandbox/repos/octocat__hello-world",
          output: " README.md | 1 +\n+cloud terminal change\n",
          truncated: false,
        },
      }),
    });
  });
  await page.route("**/api/github/workspace/pr", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        pushed: {
          fullName: "octocat/hello-world",
          branch: "sandboxedcli/change-e2e",
          baseBranch: "main",
          commitSha: "0123456789abcdef0123456789abcdef01234567",
        },
        pullRequest: {
          number: 12,
          htmlUrl: "https://github.com/octocat/hello-world/pull/12",
          head: "sandboxedcli/change-e2e",
          base: "main",
          title: "Apply sandbox changes",
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
  await page.route("**/api/sandbox/pause", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        sandbox: {
          name: "sandboxed-cli-e2e",
          state: "stopped",
          persistent: true,
          filesystemPreserved: true,
          processMemoryPreserved: false,
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

test("opens a cloned GitHub repository in the current terminal", async ({ page }) => {
  await page.goto("/terminal");
  await expect(page.getByLabel("GitHub repository", { exact: true })).toHaveValue(
    "octocat/hello-world",
  );
  await page.getByRole("button", { name: ">_clone" }).click();
  await expect(page.getByText(/octocat\/hello-world ready at/)).toBeVisible();
  await expect(page.getByRole("tab", { name: "$_terminal 1" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByText("active: octocat/hello-world", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: ">_refresh" }).click();
  await expect(page.getByText("1 repositories ready", { exact: true })).toBeVisible();
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
  let sessionCleared = false;
  await page.route("**/api/auth/session", async (route) => {
    if (route.request().method() === "DELETE") {
      sessionCleared = true;
      await route.fulfill({ contentType: "application/json", body: "{}" });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ authenticated: true, user: { login: "octocat" }, scope: "repo" }),
    });
  });

  await page.goto("/terminal");
  if (testInfo.project.name.startsWith("mobile")) {
    await page.getByRole("button", { name: ">_new" }).click();
  } else {
    await page.keyboard.press("Control+Shift+T");
  }
  await expect(page.getByRole("tab")).toHaveCount(2);
  await page.getByRole("button", { name: "$_logout →" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => sessionCleared).toBe(true);
});

test("reviews workspace changes and opens a pull request", async ({ page }) => {
  await page.goto("/terminal");
  await page.getByRole("button", { name: ">_review" }).click();
  await expect(page.getByLabel("Git status")).toContainText("README.md");
  await expect(page.getByLabel("Git diff preview")).toContainText("cloud terminal change");
  await page.getByRole("button", { name: ">_open pr" }).click();
  await expect(page.getByText("pull request #12 opened")).toBeVisible();
  await expect(page.getByRole("link", { name: "view pull request" })).toHaveAttribute(
    "href",
    "https://github.com/octocat/hello-world/pull/12",
  );
});

test("validates an optional delivery branch before opening a pull request", async ({ page }) => {
  await page.goto("/terminal");
  await page.getByRole("button", { name: ">_review" }).click();
  const branch = page.getByRole("textbox", { name: "branch" });
  const deliver = page.getByRole("button", { name: ">_open pr" });

  await branch.fill("not a branch");
  await expect(deliver).toBeDisabled();
  await expect(page.getByText("use letters, numbers, `.`, `_`, `/`, or `-`", { exact: true })).toBeVisible();
  await branch.fill("sandboxedcli/reviewable-change");
  await expect(deliver).toBeEnabled();
});

test("retries repository loading without forcing github login", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/github/repos", async (route) => {
    if (!route.request().url().endsWith("/api/github/repos")) return route.continue();
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "github unavailable" }),
      });
      return;
    }
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

  await page.goto("/terminal");
  await expect(page.getByText("github unavailable", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: ">_login github" })).toHaveCount(0);
  await page.getByRole("button", { name: ">_retry load" }).click();
  await expect(page.getByText("1 repositories ready", { exact: true })).toBeVisible();
});

test("retries a failed repository clone", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/github/repos/clone", async (route) => {
    if (!route.request().url().endsWith("/api/github/repos/clone")) return route.continue();
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "clone failed" }),
      });
      return;
    }
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

  await page.goto("/terminal");
  await page.getByRole("button", { name: ">_clone" }).click();
  await expect(page.getByText("clone failed", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: ">_retry clone" }).click();
  await expect(page.getByText(/octocat\/hello-world ready at/)).toBeVisible();
});

test("lands the current terminal in a cloned repository", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith("mobile"), "xterm transcript assertion is desktop-only");
  await page.goto("/terminal");
  await page.getByRole("button", { name: ">_clone" }).click();
  await expect(page.getByRole("tab", { name: "$_terminal 1" })).toHaveAttribute("aria-selected", "true");
  const input = page.getByRole("tabpanel").locator(".xterm-helper-textarea");
  await input.pressSequentially("pwd");
  await input.press("Enter");
  await expect(page.getByRole("tabpanel").locator(".xterm-accessibility-tree")).toContainText(
    "/vercel/sandbox/repos/octocat__hello-world",
  );
});

test("reuses the current terminal when a repository is already present", async ({ page }) => {
  await page.route("**/api/github/repos/clone", async (route) => {
    if (!route.request().url().endsWith("/api/github/repos/clone")) return route.continue();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        clone: {
          fullName: "octocat/hello-world",
          branch: "main",
          directory: "/vercel/sandbox/repos/octocat__hello-world",
          alreadyPresent: true,
        },
      }),
    });
  });

  await page.goto("/terminal");
  await page.getByRole("button", { name: ">_clone" }).click();
  await expect(page.getByText(/octocat\/hello-world already at/)).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(1);
});

test("warns when the git diff preview is truncated", async ({ page }) => {
  await page.route("**/api/github/workspace/diff", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        diff: {
          repositoryDirectory: "/vercel/sandbox/repos/octocat__hello-world",
          output: " README.md | 1 +\n+cloud terminal change\n",
          truncated: true,
        },
      }),
    });
  });

  await page.goto("/terminal");
  await page.getByRole("button", { name: ">_review" }).click();
  await expect(
    page.getByText("diff truncated · review the remaining changes in the terminal", { exact: true }),
  ).toBeVisible();
});

test("retries a failed sandbox pause", async ({ page }) => {
  let attempts = 0;
  await page.unroute("**/api/sandbox/pause");
  await page.route("**/api/sandbox/pause", async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "pause failed" }),
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        sandbox: {
          name: "sandboxed-cli-e2e",
          state: "stopped",
          persistent: true,
          filesystemPreserved: true,
          processMemoryPreserved: false,
        },
      }),
    });
  });

  await page.goto("/terminal");
  await page.getByRole("button", { name: ">_pause" }).click();
  await expect(page.getByRole("button", { name: ">_retry pause" })).toBeVisible();
  await page.getByRole("button", { name: ">_retry pause" }).click();
  await expect(page.getByText("stopped · files preserved · processes reset")).toBeVisible();
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
