import { expect, test } from "@playwright/test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

import { createProviderSafePngBuffer, openCleanStaticPage } from "./helpers/staticHtmlHarness";
import { DEFAULT_CONFIG } from "../../src/core/config";

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
const textOnly = process.env.E2E_REAL_TEXT_ONLY === "1";
const textRequests: { endpoint: string; status: number | null; durationMs: number; usage?: Record<string, number>; errorClassification?: string }[] = [];
const pendingUsage: Promise<void>[] = [];
let blockedRequests = 0;
const textPostLimit = Number(process.env.E2E_REAL_POST_LIMIT ?? 8);
const reportLabel = process.env.E2E_REAL_REPORT_LABEL ?? "";
if (textOnly && (!Number.isInteger(textPostLimit) || textPostLimit < 1 || textPostLimit > 8)) {
  throw new Error("Real text request limit must be an integer between 1 and 8.");
}
if (textOnly && reportLabel && !/^[a-z0-9-]+$/.test(reportLabel)) {
  throw new Error("Real text report label must be a plain directory name.");
}

test.beforeEach(async ({ page }) => {
  if (!runRealProvider || !textOnly) return;
  const providerOrigin = new URL(requireE2eEnv("E2E_BASE_URL")).origin;
  const allowedPaths = new Set(["/step_plan/v1/responses", "/step_plan/v1/chat/completions"]);
  const starts = new Map<string, number>();
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === "127.0.0.1" || url.protocol === "file:") return route.continue();
    if (url.origin !== providerOrigin || !allowedPaths.has(url.pathname)) {
      blockedRequests += 1;
      return route.abort("blockedbyclient");
    }
    if (request.method() === "POST") {
      if (textRequests.length >= textPostLimit) {
        blockedRequests += 1;
        return route.abort("blockedbyclient");
      }
      const payload = request.postDataJSON() as { model?: string };
      if (payload.model !== requireE2eEnv("E2E_TEXT_MODEL")
        || request.headers().authorization !== `Bearer ${requireE2eEnv("E2E_API_KEY")}`) {
        blockedRequests += 1;
        return route.abort("blockedbyclient");
      }
      starts.set(request.url(), Date.now());
      textRequests.push({ endpoint: url.pathname.endsWith("/responses") ? "responses" : "chat-completions", status: null, durationMs: 0 });
    }
    return route.continue();
  });
  page.on("response", (response) => {
    if (response.request().method() !== "POST") return;
    const started = starts.get(response.url());
    if (started === undefined) return;
    starts.delete(response.url());
    const entry = textRequests.findLast((item) => item.status === null);
    if (!entry) return;
    entry.status = response.status();
    entry.durationMs = Date.now() - started;
    pendingUsage.push((async () => {
      try {
        if (!response.ok()) {
          const body = await response.text();
          entry.durationMs = Date.now() - started;
          entry.errorClassification = /identity verification/i.test(body) ? "identity-verification-required"
            : /404\s*page\s*not\s*found/i.test(body) ? "plain-route-not-found"
            : /unsupported (?:endpoint|route|path)|unknown (?:endpoint|route|path)|no route/i.test(body) ? "unsupported-route"
            : /model.*(?:not found|unsupported|not support)/i.test(body) ? "model-unavailable"
            : "other-http-error";
          return;
        }
        const payload = await response.json() as { usage?: Record<string, unknown> };
        entry.durationMs = Date.now() - started;
        if (payload.usage) entry.usage = Object.fromEntries(Object.entries(payload.usage)
          .filter((pair): pair is [string, number] => ["prompt_tokens", "completion_tokens", "total_tokens", "input_tokens", "output_tokens"].includes(pair[0])
            && typeof pair[1] === "number" && Number.isFinite(pair[1])));
      } catch { /* No response contents or error details enter the ledger. */ }
    })());
  });
});

test.afterAll(async () => {
  if (!runRealProvider || !textOnly) return;
  await Promise.allSettled(pendingUsage);
  const reportDir = resolve(".acceptance", "text-provider-20261014", reportLabel);
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(join(reportDir, "request-ledger.json"), JSON.stringify({ requestCount: textRequests.length, blockedRequests, requests: textRequests }, null, 2));
});

async function openRealProviderPage(page: Parameters<typeof openCleanStaticPage>[0]) {
  await openCleanStaticPage(page, {
    baseUrl: requireE2eEnv("E2E_BASE_URL"),
    apiKey: requireE2eEnv("E2E_API_KEY"),
    textModel: requireE2eEnv("E2E_TEXT_MODEL"),
    imageModel: requireE2eEnv("E2E_IMAGE_MODEL"),
    imageResponseMode: "force-base64",
  });
}

async function expectTextConnectivity(page: Parameters<typeof openCleanStaticPage>[0]) {
  await page.waitForFunction(() => Array.from(document.querySelectorAll(".message-card"))
    .some((element) => /文字模型响应成功|文字模型测试失败/.test(element.textContent ?? "")), undefined, { timeout: 180_000 });
  expect(await page.locator(".message-card").filter({ hasText: "文字模型响应成功" }).isVisible()).toBe(true);
}

test.describe("real provider static page smoke", () => {
  test.skip(!runRealProvider, "Set E2E_REAL_PROVIDER=1 to run real provider page smoke.");

  test("real text settings connectivity succeeds", async ({ page }) => {
    await openRealProviderPage(page);
    await page.getByRole("tab", { name: "设置" }).click();
    await page.getByRole("button", { name: "测试文字模型", exact: true }).click();
    await expectTextConnectivity(page);
  });

  test("real text prompt optimization updates the effective prompt", async ({ page }) => {
    await openRealProviderPage(page);
    const source = "请将以下描述优化成不超过80字的生图提示词，只返回提示词：蓝色圆形图标，白色背景，扁平风格。";
    await page.getByTestId("single-prompt").fill(source);
    await page.getByRole("button", { name: "优化提示词", exact: true }).click();
    const revised = page.getByRole("textbox", { name: "优化后的提示词", exact: true });
    await expect(page.getByRole("button", { name: "优化提示词", exact: true })).toBeEnabled({ timeout: 180_000 });
    const value = await revised.inputValue();
    expect(Boolean(value.trim()) && value !== source).toBe(true);
    await expect.poll(async () => {
      const value = await revised.inputValue();
      return (await page.locator(".readonly-value").textContent())?.trim() === value.trim();
    }).toBe(true);
  });

  test("real text file-mode connectivity succeeds", async ({ page }) => {
    const profile = {
      ...DEFAULT_CONFIG.providerProfiles[0],
      baseUrl: requireE2eEnv("E2E_BASE_URL"),
      apiKey: requireE2eEnv("E2E_API_KEY"),
      textModel: requireE2eEnv("E2E_TEXT_MODEL"),
      rememberApiKey: false,
    };
    await page.addInitScript((config) => localStorage.setItem("chat-to-image.config.v1", JSON.stringify(config)), {
      ...DEFAULT_CONFIG,
      ...profile,
      hasDismissedWelcome: true,
      providerProfiles: [profile],
    });
    await page.goto(pathToFileURL(resolve("dist-static/gpt-image-2-studio-lite.html")).href);
    await page.getByRole("tab", { name: "设置" }).click();
    await page.getByRole("button", { name: "测试文字模型", exact: true }).click();
    await expectTextConnectivity(page);
  });

  test("real wrong api key surfaces an auth-classified failure", async ({ page }) => {
    await openCleanStaticPage(page, {
      baseUrl: requireE2eEnv("E2E_BASE_URL"),
      apiKey: "wrong-key-e2e",
      textModel: requireE2eEnv("E2E_TEXT_MODEL"),
      imageModel: requireE2eEnv("E2E_IMAGE_MODEL"),
      imageResponseMode: "force-base64",
    });

    await page.getByRole("tab", { name: "单图" }).click();
    await page.getByTestId("single-prompt").fill("验证错误密钥路径的极简图标");
    await page.getByTestId("single-generate").click();

    const errorCopy = page.locator(".preview-panel .error-copy");
    await expect(errorCopy).toBeVisible({ timeout: 60_000 });
    await expect(errorCopy).toContainText(/401|认证|鉴权|key|api/i);
  });

  test("real wrong image model surfaces a provider-classified failure", async ({ page }) => {
    await openCleanStaticPage(page, {
      baseUrl: requireE2eEnv("E2E_BASE_URL"),
      apiKey: requireE2eEnv("E2E_API_KEY"),
      textModel: requireE2eEnv("E2E_TEXT_MODEL"),
      imageModel: "step-e2e-nonexistent-model",
      imageResponseMode: "force-base64",
    });

    await page.getByRole("tab", { name: "单图" }).click();
    await page.getByTestId("single-prompt").fill("验证错误模型路径的极简图标");
    await page.getByTestId("single-generate").click();

    const errorCopy = page.locator(".preview-panel .error-copy");
    await expect(errorCopy).toBeVisible({ timeout: 60_000 });
    await expect(errorCopy).toContainText(/400|404|model|模型/i);
  });

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
