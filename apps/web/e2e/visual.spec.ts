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
