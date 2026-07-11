# Static HTML Page E2E Automation And Save Directory Plan

> **历史材料：** 本文已被 2026-07-11 独立审计与修复取代，仅保留用于追溯，不代表当前验证结论。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为静态 HTML 版本补齐最小页面级 E2E 验证能力，并把无法全自动证明的 Chrome/Edge 保存目录授权流程固化为可执行人工验收。

**Architecture:** 保持纯静态网页架构，不引入后端代理。页面级 E2E 使用 Playwright 驱动本地 `vite preview` 页面，真实供应商配置只从 `.env.e2e.local` 读取；File System Access API 原生目录选择不强行自动化，单独保留人工验收清单和记录模板。

**Tech Stack:** React 19, TypeScript, Vite 8, Vitest, Playwright, PowerShell, Chrome/Edge, File System Access API.

---

## File Structure

- Create: `tests/e2e/static-html-page.spec.ts`
  - 页面级 smoke 测试入口：页面加载、设置保存、单图 mock 成功、批量 mock 成功、历史记录可见。
- Create: `tests/e2e/helpers/staticHtmlHarness.ts`
  - Playwright 公共工具：启动页定位、localStorage 清理、mock 图片接口、配置页面字段。
- Create: `tests/e2e/fixtures/one-pixel.png`
  - 图生图上传用 1x1 或 128x128 PNG 测试图片，避免依赖外部网络。
- Modify: `package.json`
  - 增加 `e2e:install`、`e2e:static`、`e2e:static:headed` 脚本。
- Modify: `docs/playwright-static-html-e2e-fix-verification-2026-07-05.zh-CN.md`
  - 记录页面级自动化结果和人工保存目录验收状态。
- Create: `docs/static-html-manual-save-directory-acceptance.zh-CN.md`
  - Chrome/Edge 保存目录人工验收手册。
- Modify: `.gitignore`
  - 确认忽略 `.env.e2e.local`、Playwright 临时输出、trace、截图和视频。

## Task 1: Add Playwright Page-Level Test Infrastructure

**Files:**

- Modify: `package.json`
- Modify: `.gitignore`
- Create: `tests/e2e/helpers/staticHtmlHarness.ts`

- [ ] **Step 1: Add Playwright dev dependency**

Run:

```powershell
npm install -D @playwright/test
```

Expected: `package.json` and lockfile update. Do not edit lockfile manually.

- [ ] **Step 2: Add E2E scripts**

In `package.json`, add:

```json
"e2e:install": "playwright install chromium",
"e2e:static": "playwright test tests/e2e --config=playwright.static.config.ts",
"e2e:static:headed": "playwright test tests/e2e --config=playwright.static.config.ts --headed"
```

Expected: scripts are available via `npm run e2e:static`.

- [ ] **Step 3: Add Playwright config**

Create `playwright.static.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "npm exec -- vite preview --config vite.static.config.ts --host 127.0.0.1 --port 4174 --strictPort",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
```

- [ ] **Step 4: Ignore Playwright artifacts**

In `.gitignore`, ensure these entries exist:

```gitignore
.env.e2e.local
playwright-report/
test-results/
*.webm
*.trace.zip
```

- [ ] **Step 5: Run install check**

Run:

```powershell
npm run e2e:install
```

Expected: Chromium browser install succeeds.

## Task 2: Create Mocked Page-Level Single Image Smoke

**Files:**

- Create: `tests/e2e/static-html-page.spec.ts`
- Create: `tests/e2e/helpers/staticHtmlHarness.ts`

- [ ] **Step 1: Add helper functions**

Create `tests/e2e/helpers/staticHtmlHarness.ts`:

```ts
import { expect, type Page } from "@playwright/test";

export const ONE_PIXEL_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

export async function resetPageState(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
}

export async function mockImageGeneration(page: Page) {
  await page.route("**/images/generations", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [{ b64_json: ONE_PIXEL_BASE64 }],
      }),
    });
  });
}

export async function fillMinimalSettings(page: Page) {
  await page.getByRole("button", { name: /设置/ }).click();
  await page.getByLabel(/Base URL|接口地址/).fill("https://example.test/v1");
  await page.getByLabel(/API Key|密钥/).fill("test-api-key");
  await page.getByLabel(/生图模型|图片模型/).fill("test-image-model");
  await page.getByRole("button", { name: /保存配置/ }).click();
  await expect(page.getByText(/配置已保存|已保存/)).toBeVisible();
}
```

If labels do not match the real DOM, inspect the page once and update selectors to stable visible text. Do not use brittle generated CSS selectors unless no accessible selector exists.

- [ ] **Step 2: Add single image page smoke**

Create `tests/e2e/static-html-page.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { fillMinimalSettings, mockImageGeneration, resetPageState } from "./helpers/staticHtmlHarness";

test("static page can generate one image and show history with mocked provider", async ({ page }) => {
  await resetPageState(page);
  await mockImageGeneration(page);
  await fillMinimalSettings(page);

  await page.getByRole("button", { name: /单图/ }).click();
  await page.getByLabel(/提示词/).fill("生成一张极简风格的蓝色小猫贴纸");
  await page.getByRole("button", { name: /生成|开始生成/ }).click();

  await expect(page.getByText(/成功|完成/)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("img").first()).toBeVisible();

  await page.getByRole("button", { name: /历史/ }).click();
  await expect(page.getByText(/蓝色小猫/)).toBeVisible();
});
```

- [ ] **Step 3: Run the page smoke**

Run:

```powershell
npm run build:static
npm run e2e:static -- --grep "generate one image"
```

Expected: PASS. If it fails only because selectors differ, fix selectors in `staticHtmlHarness.ts` or the test file, then rerun.

## Task 3: Create Mocked Batch Page Smoke

**Files:**

- Modify: `tests/e2e/static-html-page.spec.ts`

- [ ] **Step 1: Add batch page smoke**

Append to `tests/e2e/static-html-page.spec.ts`:

```ts
test("static page can run a custom two-prompt batch with mocked provider", async ({ page }) => {
  await resetPageState(page);
  await mockImageGeneration(page);
  await fillMinimalSettings(page);

  await page.getByRole("button", { name: /批量/ }).click();
  await page.getByText(/自定义多条提示词/).click();

  const promptInputs = page.getByLabel(/子任务提示词|提示词/);
  await promptInputs.nth(0).fill("生成一张红色机器人图标");
  await promptInputs.nth(1).fill("生成一张绿色飞船图标");

  const concurrencyInput = page.getByLabel(/并发/);
  await concurrencyInput.fill("1");

  await page.getByRole("button", { name: /生成任务列表|规划任务/ }).click();
  await page.getByRole("button", { name: /开始批量生成/ }).click();

  await expect(page.getByText(/批量完成|成功 2/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/红色机器人/)).toBeVisible();
  await expect(page.getByText(/绿色飞船/)).toBeVisible();

  await page.getByRole("button", { name: /历史/ }).click();
  await expect(page.getByText(/红色机器人/)).toBeVisible();
  await expect(page.getByText(/绿色飞船/)).toBeVisible();
});
```

- [ ] **Step 2: Run batch smoke**

Run:

```powershell
npm run e2e:static -- --grep "custom two-prompt batch"
```

Expected: PASS. If selector ambiguity appears, prefer adding stable `aria-label` or `data-testid` to the app instead of making the test fragile.

## Task 4: Add Optional Real Provider Page Smoke

**Files:**

- Create: `tests/e2e/static-html-real-provider.spec.ts`
- Modify: `docs/playwright-static-html-e2e-fix-verification-2026-07-05.zh-CN.md`

- [ ] **Step 1: Add environment reader without printing secrets**

Create `tests/e2e/static-html-real-provider.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { fillMinimalSettings, resetPageState } from "./helpers/staticHtmlHarness";

function requireE2eEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required E2E environment variable: ${name}`);
  }
  return value;
}

test.describe("real provider static page smoke", () => {
  test.skip(!process.env.E2E_REAL_PROVIDER, "Set E2E_REAL_PROVIDER=1 to run real provider smoke.");

  test("real text-to-image page flow creates preview and history", async ({ page }) => {
    await resetPageState(page);

    const baseUrl = requireE2eEnv("E2E_BASE_URL");
    const apiKey = requireE2eEnv("E2E_API_KEY");
    const imageModel = requireE2eEnv("E2E_IMAGE_MODEL");

    await page.getByRole("button", { name: /设置/ }).click();
    await page.getByLabel(/Base URL|接口地址/).fill(baseUrl);
    await page.getByLabel(/API Key|密钥/).fill(apiKey);
    await page.getByLabel(/生图模型|图片模型/).fill(imageModel);
    await page.getByRole("button", { name: /保存配置/ }).click();

    await page.getByRole("button", { name: /单图/ }).click();
    await page.getByLabel(/提示词/).fill("生成一张简单的蓝色圆形图标，纯色背景");
    await page.getByRole("button", { name: /生成|开始生成/ }).click();

    await expect(page.locator("img").first()).toBeVisible({ timeout: 180_000 });
    await page.getByRole("button", { name: /历史/ }).click();
    await expect(page.getByText(/蓝色圆形图标/)).toBeVisible();
  });
});
```

Note: if `fillMinimalSettings` is unused after real selector stabilization, remove the import before committing.

- [ ] **Step 2: Run optional real provider smoke**

Run from a shell that has loaded `.env.e2e.local` values into environment variables:

```powershell
$env:E2E_REAL_PROVIDER = "1"
npm run e2e:static -- tests/e2e/static-html-real-provider.spec.ts
```

Expected: PASS, or fail with a provider capability/rate-limit error. Do not paste full request, API key, Base URL, model name, signed URL, or provider response into docs.

- [ ] **Step 3: Record sanitized result**

In `docs/playwright-static-html-e2e-fix-verification-2026-07-05.zh-CN.md`, add:

```markdown
## 页面级 E2E 复测

- Mock 单图页面级 smoke：通过 / 失败。
- Mock 批量页面级 smoke：通过 / 失败。
- 真实供应商页面级单图 smoke：通过 / 失败 / 未执行。
- 说明：真实供应商配置来自 `.env.e2e.local`，本文档不记录真实密钥、Base URL、模型名或完整响应。
```

## Task 5: Document Manual Save Directory Acceptance

**Files:**

- Create: `docs/static-html-manual-save-directory-acceptance.zh-CN.md`
- Modify: `docs/playwright-static-html-e2e-fix-verification-2026-07-05.zh-CN.md`

- [ ] **Step 1: Create manual acceptance doc**

Create `docs/static-html-manual-save-directory-acceptance.zh-CN.md`:

```markdown
# 静态 HTML 保存目录人工验收手册

## 目的

确认 Chrome/Edge 中 File System Access API 授权目录后，图片能写入用户选择的目录，并且刷新页面后历史预览可以恢复。

## 前置条件

- 使用 Chrome 或 Edge。
- 不直接授权 Downloads 根目录。
- 建议先创建子目录：`C:\Users\<User>\Downloads\gpt-image-2-studio`。
- 准备一组可用的测试 API 配置，但不要把真实密钥写入文档或截图。

## 验收步骤

1. 打开本地 preview 或 GitHub Pages 页面。
2. 进入“设置”。
3. 点击“选择并授权目录”。
4. 选择 `Downloads\gpt-image-2-studio` 子目录。
5. 点击“测试保存目录”。
6. 确认目录中出现测试文件或测试图片。
7. 回到“单图”，生成一张小图。
8. 确认生成图片写入授权目录，而不是 Downloads 根目录。
9. 刷新页面。
10. 进入“历史”，点击最近记录。
11. 确认历史图片可以恢复预览。

## 结果记录

- 浏览器：
- 授权目录：
- 测试保存目录：通过 / 失败
- 真实图片落点：授权目录 / 浏览器默认下载目录 / 未验证
- 刷新后历史预览：可恢复 / 不可恢复 / 未验证
- 异常现象：

## 安全要求

- 不截图真实 API key。
- 不记录真实 Base URL 或模型名。
- 不记录供应商返回的签名图片 URL。
```

- [ ] **Step 2: Link manual doc from verification report**

In `docs/playwright-static-html-e2e-fix-verification-2026-07-05.zh-CN.md`, under “保存目录人工验收”, add:

```markdown
人工验收步骤已整理到 `docs/static-html-manual-save-directory-acceptance.zh-CN.md`。
```

## Task 6: Full Regression And Secret Gate

**Files:**

- All modified files from previous tasks.

- [ ] **Step 1: Run unit tests**

Run:

```powershell
npm run test:run
```

Expected: PASS.

- [ ] **Step 2: Run static build and site check**

Run:

```powershell
npm run build:static
Copy-Item -Force dist-static\versions\v0.1.4\index.html static-versions\versions\v0.1.4\index.html
npm run site:check
```

Expected: PASS.

- [ ] **Step 3: Run page-level E2E**

Run:

```powershell
npm run e2e:static
```

Expected: PASS for mocked page-level smoke tests.

- [ ] **Step 4: Run final secret scan**

Run:

```powershell
rg -n "sk-[A-Za-z0-9_-]{24,}|1ts[A-Za-z0-9_-]{20,}" . --glob "!node_modules/**" --glob "!dist/**" --glob "!.git/**"
```

Expected: no real secrets. If the command only matches regex examples inside documentation, record that manually and do not treat it as a leak.

- [ ] **Step 5: Review final diff**

Run:

```powershell
git diff -- package.json package-lock.json playwright.static.config.ts tests docs .gitignore
```

Expected:

```text
No real API key.
No real Base URL.
No real model name.
No signed provider URL.
No generated Playwright trace/video/screenshot committed.
Manual save-directory limitation is documented honestly.
```

## Self-Review Checklist

- [ ] Mocked E2E proves page-level preview/history for single image.
- [ ] Mocked E2E proves page-level preview/history for batch generation.
- [ ] Optional real provider smoke is gated by `E2E_REAL_PROVIDER=1` and never prints secrets.
- [ ] Save-directory acceptance remains manual unless a safe browser permission strategy is implemented later.
- [ ] Documentation clearly distinguishes automated proof from manual proof.
- [ ] `.env.e2e.local` remains untracked.
