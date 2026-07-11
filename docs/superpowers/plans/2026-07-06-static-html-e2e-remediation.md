# Static HTML E2E Remediation Implementation Plan

> **历史材料：** 本文已被 2026-07-11 独立审计与修复取代，仅保留用于追溯，不代表当前验证结论。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于 `docs/static-html-e2e-findings-and-evidence-2026-07-06.zh-CN.md`，补齐静态 HTML 版真实页面级 E2E、保存目录人工验收记录、批量失败语义和发布前安全门禁。

**Architecture:** 继续保持纯静态 HTML 架构，不引入后端代理。E2E 修复集中在 Playwright 定位器和测试报告；保存目录真实落点保留 Chrome/Edge 人工验收；失败语义在运行时保存层和批量 UI 层做最小加固；发布可靠性通过 `test/build/site-check/secret scan` 门禁保证。

**Tech Stack:** React 19, TypeScript, Vite 8, Vitest, Playwright Chromium, File System Access API, PowerShell.

---

## File Structure

- Modify: `tests/e2e/static-html-real-provider.spec.ts`
  - 修复图生图页面级 smoke 的文件上传定位器。
  - 确认真实页面级图生图不再失败于 `image file is required`。
- Modify: `src/App.tsx` or related upload component if needed
  - 如果真实 DOM 中缺少稳定文件 input test id，则补一个稳定 `data-testid`。
- Modify: `src/runtime/webAdapter.ts`
  - 如当前批量保存失败文案仍不清晰，补充保存失败的业务语义。
- Modify: `src/runtime/webAdapter.test.ts`
  - 锁定保存失败文案和 URL 脱敏行为。
- Modify: `src/components/BatchPanel.tsx`
  - 如批量任务卡片吞掉保存失败细节，则保留更明确的失败原因。
- Modify: `docs/playwright-static-html-e2e-fix-verification-2026-07-05.zh-CN.md`
  - 写入真实页面级 smoke、保存目录人工验收和最终安全扫描结果。
- Modify: `docs/static-html-e2e-findings-and-evidence-2026-07-06.zh-CN.md`
  - 修复完成后更新状态。

## Task 1: Fix Real Image-To-Image Page Smoke Locator

**Files:**

- Modify: `tests/e2e/static-html-real-provider.spec.ts`
- Optional modify: `src/App.tsx`

- [ ] **Step 1: Reproduce the current failure**

Run:

```powershell
$env:E2E_REAL_PROVIDER='1'
npx playwright test tests/e2e/static-html-real-provider.spec.ts --config=playwright.static.config.ts
```

Expected current failure:

```text
locator.setInputFiles: waiting for getByTestId('single-reference-input')
```

- [ ] **Step 2: Make the mode tab selector precise**

In `tests/e2e/static-html-real-provider.spec.ts`, replace:

```ts
await page.getByRole("tab", { name: "图生图" }).click();
```

with:

```ts
await page
  .getByRole("tablist", { name: "生成模式" })
  .getByRole("tab", { name: "图生图" })
  .click();
```

Rationale: the page has multiple tablists. The test must select the generation mode tablist, not rely on a global tab lookup.

- [ ] **Step 3: Locate the real file input**

If `single-reference-input` exists after Step 2, add:

```ts
await expect(page.getByTestId("single-reference-input")).toBeAttached();
await page.getByTestId("single-reference-input").setInputFiles(referencePath);
```

If it still does not exist, inspect `src/App.tsx` and add a stable test id to the hidden file input:

```tsx
<input
  data-testid="single-reference-input"
  type="file"
  accept="image/*"
  multiple
  onChange={handleReferenceImagesChange}
/>
```

Use the existing handler and props from the current component; do not duplicate upload logic.

- [ ] **Step 4: Run only the real provider image-to-image smoke**

Run:

```powershell
$env:E2E_REAL_PROVIDER='1'
npx playwright test tests/e2e/static-html-real-provider.spec.ts --config=playwright.static.config.ts -g "image-to-image"
```

Expected:

```text
The test reaches the provider call.
The page must not show "image file is required".
If provider capability fails, the error must be provider-specific and sanitized.
```

## Task 2: Complete Real Provider Page-Level Smoke

**Files:**

- Modify: `docs/playwright-static-html-e2e-fix-verification-2026-07-05.zh-CN.md`
- Modify: `docs/static-html-e2e-findings-and-evidence-2026-07-06.zh-CN.md`

- [ ] **Step 1: Run real provider page smoke**

Run:

```powershell
$env:E2E_REAL_PROVIDER='1'
npx playwright test tests/e2e/static-html-real-provider.spec.ts --config=playwright.static.config.ts
```

Expected:

```text
Text-to-image page smoke passes.
Image-to-image page smoke passes, or fails with a sanitized provider capability error.
No test output contains API key, private Base URL, private model name, signed image URL, or full provider response.
```

- [ ] **Step 2: Update verification report**

In `docs/playwright-static-html-e2e-fix-verification-2026-07-05.zh-CN.md`, update the “页面级 E2E Smoke” section:

```markdown
- 真实供应商页面级文生图：通过 / 失败，脱敏原因：...
- 真实供应商页面级图生图：通过 / 失败，脱敏原因：...
- 是否仍出现 image file is required：否 / 是。
```

- [ ] **Step 3: Update findings report**

In `docs/static-html-e2e-findings-and-evidence-2026-07-06.zh-CN.md`, update P1-002:

```markdown
真实供应商页面级图生图 smoke：已通过 / 未通过。
失败点：测试定位器 / 供应商能力 / 页面逻辑 / 其他。
```

Do not paste real API key, private Base URL, private model name, signed image URL, or full provider response.

## Task 3: Complete Save Directory Manual Acceptance

**Files:**

- Modify: `docs/playwright-static-html-e2e-fix-verification-2026-07-05.zh-CN.md`
- Modify: `docs/static-html-e2e-findings-and-evidence-2026-07-06.zh-CN.md`

- [ ] **Step 1: Create a browser-authorizable output folder**

Run:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\Downloads\gpt-image-2-studio"
```

- [ ] **Step 2: Authorize the folder manually**

In Chrome or Edge:

```text
1. Open the static page.
2. Go to Settings.
3. Click folder authorization.
4. Select C:\Users\<User>\Downloads\gpt-image-2-studio.
```

Do not manually type a `C:\...` path and assume it is authorized. Browser authorization requires the native picker.

- [ ] **Step 3: Test output directory**

Click the page’s output-directory test button.

Expected:

```text
The page reports write/read success.
A small test file or test image appears in the authorized folder.
```

- [ ] **Step 4: Generate one real image**

Expected:

```text
The generated file lands inside the authorized gpt-image-2-studio subfolder.
It does not land directly in the browser default Downloads root.
```

- [ ] **Step 5: Refresh and restore history preview**

Expected:

```text
After refresh, opening the history record can restore the preview from the authorized folder.
```

- [ ] **Step 6: Record result honestly**

In both verification and findings docs, record:

```markdown
- 浏览器：Chrome / Edge / 未执行。
- 授权目录：Downloads\gpt-image-2-studio / 其他 / 未执行。
- 测试保存目录：通过 / 失败。
- 真实图片落点：授权目录 / 默认下载目录 / 未验证。
- 刷新后历史预览：可恢复 / 不可恢复 / 未验证。
```

## Task 4: Improve Batch Save-Failure Semantics

**Files:**

- Modify: `src/runtime/webAdapter.ts`
- Modify: `src/runtime/webAdapter.test.ts`
- Optional modify: `src/components/BatchPanel.tsx`
- Optional modify: `src/i18n/translations.ts`

- [ ] **Step 1: Write or confirm save-failure wording test**

In `src/runtime/webAdapter.test.ts`, ensure there is a test equivalent to:

```ts
await expect(
  webAdapter.saveImage({
    image: { url: "https://provider.example/generated.png" },
    prompt: "A batch image.",
    optimizedPrompt: "",
    customName: "",
    config: DEFAULT_CONFIG,
    generatedAt: new Date("2026-07-06T10:00:00.000Z"),
    durationMs: 1000,
  }),
).rejects.toThrow("could not download");
```

Also assert the message includes:

```text
b64_json
```

and does not include:

```text
provider.example/generated.png
```

- [ ] **Step 2: Improve user-facing wording if needed**

If the batch UI currently shows only a generic failure, preserve the detailed save failure message in task cards. Minimum Chinese wording:

```text
供应商可能已经返回图片，但浏览器保存结果失败。请先检查保存目录授权，或确认供应商支持 b64_json 返回；不要盲目连续重试，避免重复产生调用成本。
```

Minimum English wording:

```text
The provider may have returned an image, but the browser could not save it. Check folder authorization or b64_json support before retrying repeatedly.
```

- [ ] **Step 3: Run focused tests**

Run:

```powershell
npm run test:run -- src/runtime/webAdapter.test.ts
npm run test:run -- src/App.test.tsx
```

Expected: PASS.

## Task 5: Final Regression, Build, And Security Gate

**Files:**

- Generated: `dist-static/index.html`
- Generated: `dist-static/gpt-image-2-studio-lite.html`
- Generated: `dist-static/versions/v0.1.4/index.html`
- Modify: `static-versions/versions/v0.1.4/index.html`
- Modify: `docs/playwright-static-html-e2e-fix-verification-2026-07-05.zh-CN.md`
- Modify: `docs/static-html-e2e-findings-and-evidence-2026-07-06.zh-CN.md`

- [ ] **Step 1: Run all unit and component tests**

Run:

```powershell
npm run test:run
```

Expected: PASS.

- [ ] **Step 2: Build static HTML**

Run:

```powershell
npm run build:static
```

Expected: PASS.

- [ ] **Step 3: Sync fixed version archive**

Run:

```powershell
Copy-Item -Force dist-static\versions\v0.1.4\index.html static-versions\versions\v0.1.4\index.html
```

Expected: command succeeds.

- [ ] **Step 4: Run site check**

Run:

```powershell
npm run site:check
```

Expected:

```text
Static site check passed.
```

- [ ] **Step 5: Run page-level mock E2E**

Run:

```powershell
npm run e2e:static
```

Expected:

```text
2 mock page-level tests pass.
Real provider tests are skipped unless E2E_REAL_PROVIDER=1 is set.
```

- [ ] **Step 6: Run final secret scan**

Run:

```powershell
rg -n "sk-[A-Za-z0-9_-]{24,}|1ts[A-Za-z0-9_-]{20,}" . --glob "!node_modules/**" --glob "!dist/**" --glob "!.git/**" --glob "!test-results/**" --glob "!playwright-report/**"
```

Expected:

```text
No real key is found.
Exit code 1 is acceptable because it means no matches.
```

- [ ] **Step 7: Clean local Playwright artifacts before commit if needed**

Run:

```powershell
Remove-Item -Recurse -Force test-results,playwright-report -ErrorAction SilentlyContinue
```

Expected: generated local report artifacts are not committed.

## Self-Review Checklist

- [ ] P1-002 has real page-level result, not only API-level smoke.
- [ ] P1-003 is marked complete only after Chrome/Edge manual directory authorization is actually tested.
- [ ] P2-002 save-failure wording warns about possible provider cost.
- [ ] Verification docs contain no real API key, private Base URL, private model name, signed image URL, or full provider response.
- [ ] `npm run test:run`, `npm run build:static`, `npm run site:check`, and `npm run e2e:static` pass before claiming completion.
- [ ] Secret scan has no real-key matches before commit or push.
