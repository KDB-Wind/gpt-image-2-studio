import { expect, test } from "@playwright/test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createProviderSafePngBuffer, openCleanStaticPage } from "./helpers/staticHtmlHarness";

function requireE2eEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required E2E environment variable: ${name}`);
  }

  return value;
}

function loadDotEnvE2eLocal() {
  const envPath = ".env.e2e.local";
  let content = "";

  try {
    content = readFileSync(envPath, "utf8");
  } catch {
    return;
  }

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    process.env[key] ??= value;
  }
}

loadDotEnvE2eLocal();
const runRealProvider = process.env.E2E_REAL_PROVIDER === "1";

async function openRealProviderPage(page: Parameters<typeof openCleanStaticPage>[0]) {
  await openCleanStaticPage(page, {
    baseUrl: requireE2eEnv("E2E_BASE_URL"),
    apiKey: requireE2eEnv("E2E_API_KEY"),
    textModel: requireE2eEnv("E2E_TEXT_MODEL"),
    imageModel: requireE2eEnv("E2E_IMAGE_MODEL"),
    imageResponseMode: "force-base64",
  });
}

test.describe("real provider static page smoke", () => {
  test.skip(!runRealProvider, "Set E2E_REAL_PROVIDER=1 to run real provider page smoke.");

  test("real text-to-image page flow creates preview and history", async ({ page }) => {
    await openRealProviderPage(page);

    await page.getByRole("tab", { name: "单图" }).click();
    await page.getByTestId("single-prompt").fill("生成一张简单的蓝色圆形图标，纯色背景");
    await page.getByTestId("single-generate").click();

    await expect(page.locator(".preview-panel img").first()).toBeVisible({ timeout: 180_000 });
    await page.getByRole("tab", { name: "历史" }).click();
    await expect(page.getByRole("article").filter({ hasText: "蓝色圆形图标" }).first()).toBeVisible();
  });

  test("real image-to-image page flow creates a preview", async ({ page }) => {
    await openRealProviderPage(page);

    const tempDir = mkdtempSync(join(tmpdir(), "gpt-image-2-e2e-"));
    try {
      const referencePath = join(tempDir, "reference.png");
      writeFileSync(referencePath, createProviderSafePngBuffer());

      await page.getByRole("tab", { name: "单图" }).click();
      await page.getByRole("tablist", { name: "生成模式" }).getByRole("tab", { name: "图生图" }).click();
      await expect(page.getByTestId("single-reference-input")).toBeAttached();
      await page.getByTestId("single-reference-input").setInputFiles(referencePath);
      await page.getByTestId("single-prompt").fill("把参考图改成一个简单的绿色圆形图标");

      const responsePromise = page.waitForResponse(
        (response) => response.request().method() === "POST" && response.url().includes("/images/edits"),
        { timeout: 180_000 },
      );

      await page.getByTestId("single-generate").click();
      const response = await responsePromise;

      expect(
        response.ok(),
        `Image edit endpoint returned HTTP ${response.status()}.`,
      ).toBe(true);
      await expect(page.locator(".preview-panel img").first()).toBeVisible({ timeout: 180_000 });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("real custom batch with two prompts creates two results and history evidence", async ({ page }) => {
    await openRealProviderPage(page);

    await page.getByRole("tab", { name: "批量" }).click();
    await page.getByTestId("batch-source-custom-prompts").click();
    await page.getByTestId("batch-custom-prompt-0").fill("生成一张红色机器人图标，纯色背景，极简扁平化");
    await page.getByTestId("batch-custom-prompt-1").fill("生成一张绿色飞船图标，纯色背景，极简扁平化");
    await page.getByTestId("batch-create-tasks").click();
    await page.getByTestId("batch-start").click();

    await expect(page.getByText(/批量完成：成功 2，失败 0，跳过 0。/)).toBeVisible({ timeout: 240_000 });
    await expect(page.locator(".preview-panel figure img")).toHaveCount(2, { timeout: 30_000 });

    await page.getByRole("tab", { name: "历史" }).click();
    const batchArticle = page.getByRole("article").filter({ hasText: "batch-images" }).first();
    await expect(batchArticle).toBeVisible({ timeout: 30_000 });
    await batchArticle.getByRole("button", { name: "展开批次" }).click();
    const childRecords = batchArticle.getByRole("article");
    await expect(childRecords).toHaveCount(2, { timeout: 30_000 });
    await expect(batchArticle).toContainText("红色机器人图标");
    await expect(batchArticle).toContainText("绿色飞船图标");
  });

  test("real AI planning auto-adjusts task count from 3 to 4", async ({ page }) => {
    await openRealProviderPage(page);

    await page.getByRole("tab", { name: "批量" }).click();
    await page.getByRole("spinbutton", { name: "任务数量" }).fill("3");
    await page
      .getByRole("textbox", { name: "主任务" })
      .fill("分别为法国、日本、比利时、韩国制作四张 2026 世界杯海报，每张都用对应国家的本地语言标题。");

    const planningResponsePromise = page.waitForResponse(
      (response) => {
        const url = response.url();
        return response.request().method() === "POST"
          && (url.includes("/responses") || url.includes("/chat/completions"))
          && response.ok();
      },
      { timeout: 120_000 },
    );

    await page.getByRole("button", { name: "规划任务列表" }).click();
    await planningResponsePromise;

    await expect(page.getByRole("spinbutton", { name: "任务数量" })).toHaveValue("4", { timeout: 120_000 });
    await expect(page.getByText(/AI 判断该主任务更适合拆分为 4 个任务/)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".batch-task-card")).toHaveCount(4, { timeout: 30_000 });
  });
});
