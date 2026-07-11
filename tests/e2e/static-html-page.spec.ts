import { expect, test } from "@playwright/test";

import {
  expectBatchHistoryContains,
  expectHistoryContains,
  installMockOutputDirectory,
  mockImageGeneration,
  openCleanStaticPage,
  readMockOutputDirectoryFile,
} from "./helpers/staticHtmlHarness";

test("static page generates one image, shows preview, and writes history", async ({ page }) => {
  await mockImageGeneration(page);
  await openCleanStaticPage(page);

  await page.getByRole("tab", { name: "单图" }).click();
  await page.getByTestId("single-prompt").fill("生成一张极简风格的蓝色小猫贴纸");
  await page.getByTestId("single-generate").click();

  await expect(page.locator(".preview-panel img").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("已保存图片")).toBeVisible();
  await expectHistoryContains(page, "蓝色小猫");
});

test("static page runs a custom two-prompt batch, shows previews, and writes history", async ({ page }) => {
  await mockImageGeneration(page);
  await openCleanStaticPage(page);

  await page.getByRole("tab", { name: "批量" }).click();
  await page.getByTestId("batch-source-custom-prompts").click();
  await page.getByTestId("batch-custom-prompt-0").fill("生成一张红色机器人图标");
  await page.getByTestId("batch-custom-prompt-1").fill("生成一张绿色飞船图标");
  await page.getByTestId("batch-create-tasks").click();
  await page.getByTestId("batch-start").click();

  await expect(page.getByText(/批量完成：成功 2，失败 0，跳过 0。/)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".preview-panel figure img")).toHaveCount(2);
  await expectBatchHistoryContains(page, "batch-images", "红色机器人");
  await expectBatchHistoryContains(page, "batch-images", "绿色飞船");
});

test("static batch preserves browser-download fallbacks in its summary and manifest", async ({ page }) => {
  await installMockOutputDirectory(page, {
    failImageWrites: true,
    writeError: "permission denied https://provider.example/image.png?token=private-token",
  });
  await mockImageGeneration(page);
  await openCleanStaticPage(page, { uiLanguage: "en-US" });

  await page.getByRole("tab", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Choose and authorize folder" }).click();
  await page.getByRole("tab", { name: "Batch" }).click();
  await page.getByTestId("batch-source-custom-prompts").click();
  await page.getByTestId("batch-custom-prompt-0").fill("Create a red robot icon");
  await page.getByTestId("batch-custom-prompt-1").fill("Create a green rocket icon");
  await page.getByTestId("batch-create-tasks").click();
  await page.getByTestId("batch-start").click();

  await expect(page.locator(".batch-task-list .status-pill.succeeded")).toHaveCount(2, { timeout: 60_000 });
  await expect(page.getByTestId("batch-save-summary")).toHaveText(
    "Generated successfully 2, saved to authorized directory 0, fell back to browser download 2.",
  );
  await expect(page.locator('[data-testid^="batch-save-fallback-task-"]')).toHaveCount(2);
  await expect(page.locator('[data-testid^="batch-save-fallback-task-"]').first()).toContainText("[redacted-url]");
  await expect(page.locator('[data-testid^="batch-save-fallback-task-"]').first()).not.toContainText("private-token");

  const manifestText = await readMockOutputDirectoryFile(page, "manifest.json");
  expect(manifestText).not.toBeNull();
  const manifest = JSON.parse(manifestText ?? "{}") as {
    tasks: Array<{ status: string; saveMode?: string; saveFallbackReason?: string }>;
  };
  expect(manifest.tasks).toHaveLength(2);
  expect(manifest.tasks[0]).toMatchObject({
    status: "succeeded",
    saveMode: "browser-download",
    saveFallbackReason: expect.stringContaining("[redacted-url]"),
  });
  expect(manifest.tasks[1]).toMatchObject({
    status: "succeeded",
    saveMode: "browser-download",
    saveFallbackReason: expect.stringContaining("[redacted-url]"),
  });
  expect(JSON.stringify(manifest)).not.toContain("private-token");
});

test("static batch records authorized-directory saves in its summary and manifest", async ({ page }) => {
  await installMockOutputDirectory(page);
  await mockImageGeneration(page);
  await openCleanStaticPage(page, { uiLanguage: "en-US" });

  await page.getByRole("tab", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Choose and authorize folder" }).click();
  await page.getByRole("tab", { name: "Batch" }).click();
  await page.getByTestId("batch-source-custom-prompts").click();
  await page.getByTestId("batch-custom-prompt-0").fill("Create a blue globe icon");
  await page.getByTestId("batch-custom-prompt-1").fill("Create a yellow sun icon");
  await page.getByTestId("batch-create-tasks").click();
  await page.getByTestId("batch-start").click();

  await expect(page.getByTestId("batch-save-summary")).toHaveText(
    "Generated successfully 2, saved to authorized directory 2, fell back to browser download 0.",
    { timeout: 60_000 },
  );

  const manifestText = await readMockOutputDirectoryFile(page, "manifest.json");
  expect(manifestText).not.toBeNull();
  const manifest = JSON.parse(manifestText ?? "{}") as { tasks: Array<{ saveMode?: string; saveFallbackReason?: string }> };
  expect(manifest.tasks).toHaveLength(2);
  expect(manifest.tasks[0]).toMatchObject({ saveMode: "authorized-directory" });
  expect(manifest.tasks[1]).toMatchObject({ saveMode: "authorized-directory" });
  expect(manifest.tasks[0].saveFallbackReason).toBeUndefined();
  expect(manifest.tasks[1].saveFallbackReason).toBeUndefined();
});

test("static page verifies an authorized output folder and restores history preview after reauthorization", async ({
  page,
}) => {
  await installMockOutputDirectory(page);
  await mockImageGeneration(page);
  await openCleanStaticPage(page);

  await page.getByRole("tab", { name: "设置" }).click();
  await page.getByRole("button", { name: "选择并授权目录" }).click();
  await page.getByRole("button", { name: "测试保存目录" }).click();
  await expect(page.locator(".message-card").filter({ hasText: "保存目录测试通过" })).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole("tab", { name: "单图" }).click();
  await page.getByTestId("single-prompt").fill("生成一张可恢复历史预览的橙色星星图标");
  await page.getByTestId("single-generate").click();

  await expect(page.locator(".preview-panel img").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("已保存到授权目录")).toBeVisible();

  await page.reload();
  await page.getByRole("tab", { name: "设置" }).click();
  await page.getByRole("button", { name: "选择并授权目录" }).click();

  await page.getByRole("tab", { name: "历史" }).click();
  const historyRecord = page.getByRole("article").filter({ hasText: "橙色星星图标" }).first();
  await expect(historyRecord).toBeVisible();
  await historyRecord.getByRole("button", { name: "查看" }).click();

  await expect(page.locator(".preview-panel img").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/无法恢复这张历史图片预览/)).toHaveCount(0);
});
