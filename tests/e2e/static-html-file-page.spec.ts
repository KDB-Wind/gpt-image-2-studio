import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

test("release HTML initializes directly from file without a web server", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const releaseHtmlUrl = pathToFileURL(
    resolve(process.cwd(), "dist-static", "gpt-image-2-studio-lite.html"),
  ).href;

  await page.goto(releaseHtmlUrl, { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("tab", { name: "单图" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "批量" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "历史" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "设置" })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("release HTML uses memory-only settings when browser storage is denied", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    for (const method of ["getItem", "setItem", "removeItem", "clear"] as const) {
      Object.defineProperty(Storage.prototype, method, {
        configurable: true,
        value() {
          throw new DOMException("Storage access denied by test.", "SecurityError");
        },
      });
    }
  });

  const releaseHtmlUrl = pathToFileURL(
    resolve(process.cwd(), "dist-static", "gpt-image-2-studio-lite.html"),
  ).href;

  await page.goto(releaseHtmlUrl, { waitUntil: "domcontentloaded" });
  const workspaceTabs = page.locator('.tab-strip [role="tab"]');
  await expect(workspaceTabs).toHaveCount(4);
  await page.getByRole("dialog").getByRole("button").last().click();
  await page.getByRole("tab", { name: "English" }).click();
  await workspaceTabs.nth(3).click();
  await expect(page.getByText(/memory only for this open page/i)).toBeVisible();
  await expect(page.getByText(/browser session/i)).toHaveCount(0);
  await expect(page.getByText(/long-term storage/i)).toHaveCount(0);
  await expect(page.getByTestId("settings-remember-api-key")).toBeDisabled();
  await expect(page.getByTestId("settings-remember-api-key")).not.toBeChecked();
  await page.getByTestId("settings-base-url").fill("https://memory-only.example/v1");
  await page.getByTestId("settings-api-key").fill("test-value-not-a-secret");
  await page.getByTestId("settings-text-model").fill("memory-text-model");
  await page.getByTestId("settings-image-model").fill("memory-image-model");
  await page.getByTestId("settings-save").click();

  await workspaceTabs.nth(0).click();
  await expect(workspaceTabs.nth(0)).toHaveAttribute("aria-selected", "true");
  await workspaceTabs.nth(3).click();
  await expect(page.getByTestId("settings-base-url")).toHaveValue("https://memory-only.example/v1");
  await expect(page.getByTestId("settings-api-key")).toHaveValue("test-value-not-a-secret");
  expect(pageErrors).toEqual([]);
});
