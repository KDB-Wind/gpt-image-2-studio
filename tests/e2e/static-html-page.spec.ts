import { expect, test } from "@playwright/test";

import {
  expectBatchHistoryContains,
  expectHistoryContains,
  installMockOutputDirectory,
  mockImageGeneration,
  openCleanStaticPage,
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
