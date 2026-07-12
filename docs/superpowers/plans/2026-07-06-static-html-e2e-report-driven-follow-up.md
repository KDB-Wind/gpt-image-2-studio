# Static HTML E2E Report-Driven Follow-Up Plan

> **历史材料：** 本文已被 2026-07-11 独立审计与修复取代，仅保留用于追溯，不代表当前验证结论。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 根据 `docs/static-html-e2e-findings-and-evidence-2026-07-06.zh-CN.md` 的 P1/P2 结论，完成剩余验收闭环、失败语义加固和发布前安全门禁。

**Architecture:** 保持 GitHub Pages / 单文件静态 HTML 架构，不新增后端。保存目录能力仍依赖浏览器 File System Access API；自动化测试负责覆盖可 mock 的代码路径，真实目录授权必须由 Chrome/Edge 人工验收补齐。发布前通过单元测试、静态构建、站点归档一致性、Playwright mock E2E、真实供应商 smoke 和密钥扫描共同把关。

**Tech Stack:** React 19, TypeScript, Vite 8, Vitest, Playwright Chromium, File System Access API, PowerShell.

---

## Source Report

- Evidence report: `docs/static-html-e2e-findings-and-evidence-2026-07-06.zh-CN.md`
- Verification log: `docs/playwright-static-html-e2e-fix-verification-2026-07-05.zh-CN.md`
- Previous remediation plan: `docs/superpowers/plans/2026-07-06-static-html-e2e-remediation.md`

## Current Findings To Preserve

- P1-001 文生图 URL 保存失败已通过 `response_format: "b64_json"` 修复并有真实供应商页面级 smoke 证据。
- P1-002 图生图 multipart 字段名已从 `image[]` 修复为重复 `image` 字段，并有真实供应商页面级 smoke 证据。
- P1-003 保存目录真实落点未闭环，这是当前唯一不能自动化完全证明的关键风险。
- P1-004 URL / token 脱敏已通过单元测试覆盖。
- P2-001 URL 下载失败诊断已加固。
- P2-002 批量保存失败的成本语义仍需要进一步显式化。
- P2-003 base64 保存链路已有回归测试，但仍需要发布前真实页面 smoke 守护。
- P2-004 版本归档一致性已有 `npm run site:check` 守护。

## File Structure

- Modify: `docs/playwright-static-html-e2e-fix-verification-2026-07-05.zh-CN.md`
  - 记录保存目录人工验收结果、真实供应商 smoke、最终安全扫描结果。
- Modify: `docs/static-html-e2e-findings-and-evidence-2026-07-06.zh-CN.md`
  - 更新 P1-003、P2-002 和残余风险状态。
- Modify: `src/runtime/webAdapter.ts`
  - 如当前保存失败文案仍不够明确，保留“供应商可能已产生调用成本”的用户提示。
- Modify: `src/runtime/webAdapter.test.ts`
  - 锁定保存失败诊断、`b64_json` 提示、URL/token 脱敏。
- Optional modify: `src/components/BatchPanel.tsx`
  - 如果批量任务卡片吞掉保存失败细节，则展示更具体的失败原因。
- Generated: `dist-static/index.html`
- Generated: `dist-static/gpt-image-2-studio-lite.html`
- Generated: `dist-static/versions/v0.1.4/index.html`
- Modify: `static-versions/versions/v0.1.4/index.html`

## Task 1: Complete P1-003 Save Directory Manual Acceptance

**Files:**

- Modify: `docs/playwright-static-html-e2e-fix-verification-2026-07-05.zh-CN.md`
- Modify: `docs/static-html-e2e-findings-and-evidence-2026-07-06.zh-CN.md`

- [ ] **Step 1: Create a browser-authorizable output subfolder**

Run:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\Downloads\gpt-image-2-studio"
```

Expected:

```text
Directory exists.
```

- [ ] **Step 2: Open the current static page in Chrome or Edge**

Use the current local static HTML:

```text
<REPO_ROOT>\dist-static\gpt-image-2-studio-lite.html
```

Expected:

```text
The page opens as a local static file or via GitHub Pages equivalent.
```

- [ ] **Step 3: Authorize the output folder through the native picker**

In the page:

```text
Settings -> 选择并授权目录 -> select C:\Users\<User>\Downloads\gpt-image-2-studio
```

Expected:

```text
The page shows the authorized folder name.
Do not treat a manually typed C:\ path as authorization.
```

- [ ] **Step 4: Run the built-in output-directory test**

Click the page's save-directory test button.

Expected:

```text
The page reports write/read success.
A test file or test artifact is created inside Downloads\gpt-image-2-studio.
```

- [ ] **Step 5: Generate one real image**

Expected:

```text
The generated image lands inside Downloads\gpt-image-2-studio, not directly in Downloads.
The history record contains the generated item.
```

- [ ] **Step 6: Refresh and restore history preview**

Refresh the page, open History, and inspect the generated image record.

Expected:

```text
The old preview can be restored from the authorized folder.
If it cannot be restored, record the exact user-facing error text and the actual disk location.
```

- [ ] **Step 7: Record the result honestly**

In both docs, record:

```markdown
- 浏览器：Chrome / Edge / 未执行。
- 授权目录：Downloads\gpt-image-2-studio / 其他 / 未执行。
- 测试保存目录：通过 / 失败。
- 真实图片落点：授权目录 / 默认下载目录 / 未验证。
- 刷新后历史预览：可恢复 / 不可恢复 / 未验证。
- 证据：只写脱敏结果，不写 API key、Base URL、模型名、签名图片 URL 或完整供应商响应。
```

## Task 2: Strengthen P2-002 Batch Save-Failure Semantics

**Files:**

- Modify: `src/runtime/webAdapter.ts`
- Modify: `src/runtime/webAdapter.test.ts`
- Optional modify: `src/components/BatchPanel.tsx`
- Optional modify: `src/i18n/translations.ts`

- [ ] **Step 1: Confirm the current failing or weak behavior**

Run:

```powershell
npm run test:run -- src/runtime/webAdapter.test.ts
```

Expected:

```text
Tests pass, but inspect whether save failure wording includes possible provider cost and b64_json guidance.
```

- [ ] **Step 2: Add or keep a regression test for URL download failure**

In `src/runtime/webAdapter.test.ts`, ensure there is a test equivalent to:

```ts
await expect(
  webAdapter.saveImage({
    image: { url: "https://provider.example/generated.png?token=secret-token" },
    prompt: "A batch image.",
    optimizedPrompt: "",
    customName: "",
    config: DEFAULT_CONFIG,
    generatedAt: new Date("2026-07-06T10:00:00.000Z"),
    durationMs: 1000,
  }),
).rejects.toThrow("b64_json");
```

Also assert:

```ts
await expect(promise).rejects.not.toThrow("provider.example");
await expect(promise).rejects.not.toThrow("secret-token");
```

- [ ] **Step 3: Improve runtime wording if needed**

In `src/runtime/webAdapter.ts`, ensure save failure wording communicates this meaning:

```text
The provider may have returned an image, but the browser could not save it. Check folder authorization or b64_json support before retrying repeatedly.
```

Chinese UI copy should communicate:

```text
供应商可能已经返回图片并产生调用成本，但浏览器保存结果失败。请先检查保存目录授权，或确认供应商支持 b64_json 返回；不要盲目连续重试。
```

- [ ] **Step 4: Preserve task-level error detail in batch UI if needed**

If `src/components/BatchPanel.tsx` maps task failures to generic text, keep the original sanitized error message in the failed task card.

Expected:

```text
Batch summary can stay concise.
Each failed task should still expose the actionable, sanitized failure reason.
```

- [ ] **Step 5: Run focused tests**

Run:

```powershell
npm run test:run -- src/runtime/webAdapter.test.ts
npm run test:run -- src/App.test.tsx
```

Expected:

```text
All focused tests pass.
```

## Task 3: Refresh Evidence Docs After Fixes

**Files:**

- Modify: `docs/playwright-static-html-e2e-fix-verification-2026-07-05.zh-CN.md`
- Modify: `docs/static-html-e2e-findings-and-evidence-2026-07-06.zh-CN.md`

- [ ] **Step 1: Update P1/P2 status**

In the evidence report, update:

```markdown
P1-003：通过 / 失败 / 未执行，并记录原因。
P2-002：已加固 / 未加固，并记录对应测试文件。
```

- [ ] **Step 2: Keep security wording strict**

The docs must not include:

```text
real API key
private Base URL
private model name
signed image URL
full provider response
```

- [ ] **Step 3: Link commands to evidence**

For every “通过” conclusion, include the exact command:

```powershell
npm run test:run
npm run build:static
npm run site:check
npm run e2e:static
$env:E2E_REAL_PROVIDER='1'; npx playwright test tests/e2e/static-html-real-provider.spec.ts --config=playwright.static.config.ts
```

Expected:

```text
The report reads as an audit trail, not just a conclusion.
```

## Task 4: Final Regression And Static Site Gate

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

Expected:

```text
All tests pass.
```

- [ ] **Step 2: Build static HTML**

Run:

```powershell
npm run build:static
```

Expected:

```text
Static HTML build succeeds.
```

- [ ] **Step 3: Sync the fixed version archive**

Run:

```powershell
Copy-Item -Force dist-static\versions\v0.1.4\index.html static-versions\versions\v0.1.4\index.html
```

Expected:

```text
The fixed version archive matches the generated version.
```

- [ ] **Step 4: Run static site check**

Run:

```powershell
npm run site:check
```

Expected:

```text
Static site check passed.
```

- [ ] **Step 5: Run mock page-level E2E**

Run:

```powershell
npm run e2e:static
```

Expected:

```text
2 mock page-level tests pass.
Real provider tests remain skipped unless E2E_REAL_PROVIDER=1 is set.
```

- [ ] **Step 6: Run real-provider page smoke when credentials are locally configured**

Run:

```powershell
$env:E2E_REAL_PROVIDER='1'
npx playwright test tests/e2e/static-html-real-provider.spec.ts --config=playwright.static.config.ts
```

Expected:

```text
Text-to-image and image-to-image page-level smoke pass.
No test output or docs contain real secrets.
```

- [ ] **Step 7: Run final secret scan**

Run:

```powershell
rg -n "sk-[A-Za-z0-9_-]{24,}|1ts[A-Za-z0-9_-]{20,}" . --glob "!node_modules/**" --glob "!dist/**" --glob "!.git/**" --glob "!test-results/**" --glob "!playwright-report/**"
```

Expected:

```text
No real key is found.
Exit code 1 is acceptable because it means no matches.
```

- [ ] **Step 8: Clean local Playwright artifacts**

Run:

```powershell
Remove-Item -Recurse -Force test-results,playwright-report -ErrorAction SilentlyContinue
```

Expected:

```text
Generated local Playwright artifacts are not committed.
```

## Self-Review Checklist

- [ ] P1-003 is not marked complete unless Chrome/Edge directory authorization was actually tested.
- [ ] P2-002 clearly tells users that save failure may still mean provider cost occurred.
- [ ] Docs contain command-level evidence, not only conclusions.
- [ ] Docs contain no real API key, private Base URL, private model name, signed image URL, or full provider response.
- [ ] `npm run test:run`, `npm run build:static`, `npm run site:check`, and `npm run e2e:static` pass before claiming completion.
- [ ] `static-versions/versions/v0.1.4/index.html` matches `dist-static/versions/v0.1.4/index.html`.
- [ ] Secret scan reports no real-key matches before commit or push.
