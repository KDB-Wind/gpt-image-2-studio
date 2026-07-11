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
