import { expect, test } from "@playwright/test";
import { Buffer } from "node:buffer";

import {
  ONE_PIXEL_PNG_BASE64,
  expectBatchHistoryContains,
  expectHistoryContains,
  installMockOutputDirectory,
  mockImageGeneration,
  openCleanStaticPage,
  readMockOutputDirectoryFile,
} from "./helpers/staticHtmlHarness";

type CapturedMultipartRequest = {
  fields: Record<string, string[]>;
  files: Array<{ fieldName: string; fileName: string; type: string; size: number }>;
};

async function readMultipartRequest(request: import("@playwright/test").Request): Promise<CapturedMultipartRequest> {
  const contentType = await request.headerValue("content-type");
  const body = request.postDataBuffer();
  expect(contentType).toContain("multipart/form-data; boundary=");
  expect(body).not.toBeNull();

  const formData = await new Response(body, { headers: { "content-type": contentType ?? "" } }).formData();
  const fields: Record<string, string[]> = {};
  const files: CapturedMultipartRequest["files"] = [];
  for (const [fieldName, value] of formData.entries()) {
    if (typeof value === "string") {
      fields[fieldName] = [...(fields[fieldName] ?? []), value];
    } else {
      files.push({ fieldName, fileName: value.name, type: value.type, size: value.size });
    }
  }
  return { fields, files };
}

test("static config keeps desktop and Pixel 7 mobile projects", async ({}, testInfo) => {
  expect(testInfo.config.projects.map((project) => project.name)).toEqual(
    expect.arrayContaining(["chromium", "chromium-pixel-7"]),
  );
});

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

test("static single-task retry moves failed to succeeded without duplicate calls or history", async ({ page }) => {
  let providerCalls = 0;
  let releaseRetryResponse!: () => void;
  const retryResponseBarrier = new Promise<void>((resolve) => {
    releaseRetryResponse = resolve;
  });
  await page.route("**/images/generations", async (route) => {
    providerCalls += 1;
    if (providerCalls === 1) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "Mock validation failure." } }),
      });
      return;
    }

    await retryResponseBarrier;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [{ b64_json: ONE_PIXEL_PNG_BASE64 }] }),
    });
  });
  await installMockOutputDirectory(page);
  await openCleanStaticPage(page, { uiLanguage: "en-US", batchDefaultTaskCount: 1 });

  await page.getByRole("tab", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Choose and authorize folder" }).click();
  await page.getByRole("tab", { name: "Batch" }).click();
  await page.getByTestId("batch-source-custom-prompts").click();
  await page.getByLabel("Batch title").fill("retry-history-batch");
  await page.getByTestId("batch-custom-prompt-0").fill("Create one retryable poster");
  await page.getByTestId("batch-create-tasks").click();
  await page.getByTestId("batch-start").click();

  const retryButton = page.getByRole("button", { name: "Retry this task" });
  await expect(retryButton).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".batch-task-list .status-pill.failed")).toHaveCount(1);
  await retryButton.evaluate((button) => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  await expect.poll(() => providerCalls).toBe(2);
  await expect(page.getByTestId("batch-start")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Retry failed tasks" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Clear current batch" })).toBeDisabled();
  await expect(page.locator(".batch-task-card .batch-task-prompt-textarea")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Pause" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Cancel remaining" })).toBeDisabled();

  releaseRetryResponse();
  await expect(page.locator(".batch-task-list .status-pill.succeeded")).toHaveCount(1, { timeout: 30_000 });
  expect(providerCalls).toBe(2);

  const manifestText = await readMockOutputDirectoryFile(page, "manifest.json");
  expect(manifestText).not.toBeNull();
  const manifest = JSON.parse(manifestText ?? "{}") as {
    tasks: Array<{ status: string; prompt: string }>;
  };
  expect(manifest.tasks).toEqual([
    expect.objectContaining({ status: "succeeded", prompt: "Create one retryable poster" }),
  ]);

  await page.getByRole("tab", { name: "History" }).click();
  const batchHistory = page.getByRole("article").filter({ hasText: "retry-history-batch" }).first();
  await expect(batchHistory).toBeVisible();
  const expandButton = batchHistory.getByRole("button", { name: "Expand batch" });
  if (await expandButton.isVisible()) {
    await expandButton.click();
  }
  await expect(batchHistory.locator(".history-batch-task")).toHaveCount(1);
  await expect(batchHistory.locator(".history-batch-task")).toContainText("Create one retryable poster");
});

test("static batch sends global and task-specific references as repeated image fields", async ({ page }) => {
  const requests: CapturedMultipartRequest[] = [];
  await page.route("**/images/edits", async (route) => {
    requests.push(await readMultipartRequest(route.request()));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [{ b64_json: ONE_PIXEL_PNG_BASE64 }] }),
    });
  });
  await openCleanStaticPage(page, { uiLanguage: "en-US", batchDefaultTaskCount: 2 });

  await page.getByRole("tab", { name: "Batch" }).click();
  await page.locator("details.batch-reference-section").evaluate((details: HTMLDetailsElement) => {
    details.open = true;
    details.dispatchEvent(new Event("toggle", { bubbles: true }));
  });
  await page.getByLabel("Batch reference images (image-to-image)").setInputFiles({
    name: "global-reference.png",
    mimeType: "image/png",
    buffer: Buffer.from(ONE_PIXEL_PNG_BASE64, "base64"),
  });
  await page.getByTestId("batch-source-custom-prompts").click();
  await page.getByTestId("batch-custom-prompt-0").fill("Reference task alpha");
  await page.getByTestId("batch-custom-prompt-1").fill("Reference task beta");
  await page.getByTestId("batch-create-tasks").click();
  await page.getByRole("button", { name: "Expand all task references" }).click();
  await page.getByLabel("Task 1 reference images").setInputFiles({
    name: "alpha-only.png",
    mimeType: "image/png",
    buffer: Buffer.from(ONE_PIXEL_PNG_BASE64, "base64"),
  });
  await page.getByLabel("Task 2 reference images").setInputFiles([
    {
      name: "beta-one.png",
      mimeType: "image/png",
      buffer: Buffer.from(ONE_PIXEL_PNG_BASE64, "base64"),
    },
    {
      name: "beta-two.png",
      mimeType: "image/png",
      buffer: Buffer.from(ONE_PIXEL_PNG_BASE64, "base64"),
    },
  ]);
  await page.getByTestId("batch-start").click();
  await expect(page.locator(".batch-task-list .status-pill.succeeded")).toHaveCount(2, { timeout: 60_000 });

  expect(requests).toHaveLength(2);
  const requestsByPrompt = Object.fromEntries(requests.map((request) => [request.fields.prompt?.[0], request]));
  expect(requestsByPrompt["Reference task alpha"].files).toEqual([
    expect.objectContaining({ fieldName: "image", fileName: "global-reference.png" }),
    expect.objectContaining({ fieldName: "image", fileName: "alpha-only.png" }),
  ]);
  expect(requestsByPrompt["Reference task beta"].files).toEqual([
    expect.objectContaining({ fieldName: "image", fileName: "global-reference.png" }),
    expect.objectContaining({ fieldName: "image", fileName: "beta-one.png" }),
    expect.objectContaining({ fieldName: "image", fileName: "beta-two.png" }),
  ]);
  expect(requests.flatMap((request) => request.files.map((file) => file.fieldName))).not.toContain("image[]");
});

test("static batch restores its master task, child prompts, count, and statuses after reload", async ({ page }) => {
  await mockImageGeneration(page);
  await openCleanStaticPage(page, { uiLanguage: "en-US", batchDefaultTaskCount: 2 });

  await page.getByRole("tab", { name: "Batch" }).click();
  await page.getByLabel("Master task").fill("Create a two-poster launch campaign");
  await page.getByTestId("batch-create-tasks").click();
  const childPrompts = page.locator(".batch-task-list .batch-task-prompt-textarea");
  await childPrompts.nth(0).fill("Launch poster alpha");
  await childPrompts.nth(1).fill("Launch poster beta");
  await page.getByTestId("batch-start").click();
  await expect(page.locator(".batch-task-list .status-pill.succeeded")).toHaveCount(2, { timeout: 60_000 });

  await page.reload();
  await page.getByRole("tab", { name: "Batch" }).click();
  await expect(page.getByLabel("Master task")).toHaveValue("Create a two-poster launch campaign");
  await expect(page.getByLabel("Task count")).toHaveValue("2");
  const restoredChildPrompts = page.locator(".batch-task-list .batch-task-prompt-textarea");
  await expect(restoredChildPrompts).toHaveCount(2);
  await expect(restoredChildPrompts.nth(0)).toHaveValue("Launch poster alpha");
  await expect(restoredChildPrompts.nth(1)).toHaveValue("Launch poster beta");
  await expect(page.locator(".batch-task-list .status-pill.succeeded")).toHaveCount(2);
});

test("@mobile static workspaces avoid horizontal overflow and keep primary controls usable", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Pixel 7 coverage runs in the mobile project.");
  await mockImageGeneration(page);
  await openCleanStaticPage(page, { uiLanguage: "en-US", batchDefaultTaskCount: 1 });

  const expectNoHorizontalOverflow = async () => {
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  };

  await page.getByRole("tab", { name: "Single image" }).click();
  await expect(page.getByTestId("single-prompt")).toBeVisible();
  await page.getByTestId("single-prompt").fill("Mobile single prompt");
  await expect(page.getByTestId("single-generate")).toBeVisible();
  await page.getByTestId("single-generate").click();
  await expect(page.locator(".preview-panel img").first()).toBeVisible({ timeout: 30_000 });
  await expectNoHorizontalOverflow();

  await page.getByRole("tab", { name: "Batch" }).click();
  await page.getByTestId("batch-source-custom-prompts").click();
  await page.getByTestId("batch-custom-prompt-0").fill("Mobile batch prompt");
  await page.getByTestId("batch-create-tasks").click();
  await expect(page.getByTestId("batch-start")).toBeVisible();
  await expect(page.getByTestId("batch-start")).toBeEnabled();
  await expectNoHorizontalOverflow();

  await page.getByRole("tab", { name: "History" }).click();
  const viewHistory = page.getByRole("button", { name: "Inspect" }).first();
  await expect(viewHistory).toBeVisible();
  await expect(viewHistory).toBeEnabled();
  await viewHistory.click();
  await expect(page.locator("article.history-item.selected")).toContainText("Mobile single prompt");
  await expectNoHorizontalOverflow();

  await page.getByRole("tab", { name: "Settings" }).click();
  await expect(page.getByTestId("settings-save")).toBeVisible();
  await expect(page.getByTestId("settings-save")).toBeEnabled();
  await page.getByTestId("settings-save").click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
  await expectNoHorizontalOverflow();
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
    "Generated successfully 2, saved to authorized directory 0, fell back to browser download 2, history available only in this session 0.",
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
    "Generated successfully 2, saved to authorized directory 2, fell back to browser download 0, history available only in this session 0.",
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
