# Static HTML E2E Hardening Implementation Plan

> **历史材料：** 本文已被 2026-07-11 独立审计与修复取代，仅保留用于追溯，不代表当前验证结论。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于 `docs/static-html-e2e-diagnostic-report-2026-07-06.zh-CN.md`，完成静态 HTML 真实供应商链路的复测、保存目录人工验收、错误语义加固和发布前安全检查。

**Architecture:** 保持静态网页架构，不引入后端代理。请求兼容性在 `src/core/apiClient.ts` 解决，浏览器保存与错误诊断在 `src/runtime/webAdapter.ts` 解决，真实供应商和保存目录结果通过独立复测文档沉淀。

**Tech Stack:** React 19, TypeScript, Vite 8, Vitest, File System Access API, OpenAI-compatible image API, PowerShell, optional Playwright smoke.

---

## File Structure

- Modify: `src/core/apiClient.ts`
  - 确认文生图和图生图都请求 `response_format: "b64_json"`。
  - 确认图生图 multipart 使用重复 `image` 字段。
- Modify: `src/core/apiClient.test.ts`
  - 锁定请求体和 multipart 字段断言。
- Modify: `src/runtime/webAdapter.ts`
  - 保留 URL 下载失败的可诊断错误。
  - 如需要，补充保存失败原因分类。
- Modify: `src/runtime/webAdapter.test.ts`
  - 锁定 URL fetch reject / HTTP 非 2xx 的错误信息。
  - 如需要，补充保存失败原因分类测试。
- Create: `docs/playwright-static-html-e2e-fix-verification-2026-07-06.zh-CN.md`
  - 记录真实供应商 smoke、保存目录人工验收、安全扫描和残余风险。
- Modify: `docs/playwright-static-html-e2e-plan.zh-CN.md`
  - 若人工验收步骤仍不够清晰，补充 Chrome/Edge 保存目录复测说明。

## Task 1: Lock API Request Compatibility

**Files:**

- Modify: `src/core/apiClient.test.ts`
- Modify: `src/core/apiClient.ts`

- [ ] **Step 1: Run focused API client tests**

Run:

```powershell
npm run test:run -- src/core/apiClient.test.ts
```

Expected: PASS. If it fails, inspect only request body and multipart field related failures first.

- [ ] **Step 2: Verify text-to-image request body**

Check `src/core/apiClient.test.ts` has assertions equivalent to:

```ts
expect(
  buildImageGenerationRequest({
    model: "gpt-image-2",
    prompt: "A cinematic skyline at dusk.",
    size: "1024x1024",
    quality: "high",
    n: 1,
    outputFormat: "png",
    outputCompression: 90,
  }),
).toEqual({
  model: "gpt-image-2",
  prompt: "A cinematic skyline at dusk.",
  size: "1024x1024",
  quality: "high",
  n: 1,
  response_format: "b64_json",
  output_format: "png",
});
```

- [ ] **Step 3: Verify image-to-image multipart body**

Check `src/core/apiClient.test.ts` has assertions equivalent to:

```ts
expect(payload.get("response_format")).toBe("b64_json");
expect(payload.getAll("image[]")).toHaveLength(0);
expect(payload.getAll("image")).toHaveLength(1);
```

- [ ] **Step 4: Commit only if API compatibility was changed**

If code changes were needed:

```powershell
git add src/core/apiClient.ts src/core/apiClient.test.ts
git commit -m "fix: request base64 images from compatible providers"
```

If no code changes were needed, do not create an empty commit.

## Task 2: Lock URL Download Diagnostics

**Files:**

- Modify: `src/runtime/webAdapter.test.ts`
- Modify: `src/runtime/webAdapter.ts`

- [ ] **Step 1: Run focused web adapter tests**

Run:

```powershell
npm run test:run -- src/runtime/webAdapter.test.ts
```

Expected: PASS.

- [ ] **Step 2: Verify rejected URL fetch has a diagnostic error**

Ensure `src/runtime/webAdapter.test.ts` contains a test equivalent to:

```ts
vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")));

await expect(
  webAdapter.saveImage({
    image: { url: "https://provider.example/generated.png" },
    prompt: "A small test image.",
    optimizedPrompt: "",
    customName: "",
    config: DEFAULT_CONFIG,
    generatedAt: new Date("2026-07-05T10:00:00.000Z"),
    durationMs: 1200,
  }),
).rejects.toThrow("provider returned an image URL");
```

- [ ] **Step 3: Verify non-OK URL fetch includes HTTP status**

Ensure `src/runtime/webAdapter.test.ts` contains a test equivalent to:

```ts
vi.stubGlobal(
  "fetch",
  vi.fn().mockResolvedValueOnce({
    ok: false,
    status: 403,
  }),
);
```

Expected assertion: thrown message contains `HTTP 403`, the provider URL, and `b64_json`.

- [ ] **Step 4: Commit only if diagnostics were changed**

If code changes were needed:

```powershell
git add src/runtime/webAdapter.ts src/runtime/webAdapter.test.ts
git commit -m "fix: explain provider image url download failures"
```

If no code changes were needed, do not create an empty commit.

## Task 3: Add Real Provider Smoke Verification Report

**Files:**

- Create: `docs/playwright-static-html-e2e-fix-verification-2026-07-06.zh-CN.md`

- [ ] **Step 1: Start static preview**

Run:

```powershell
npm run build:static
npm exec -- vite preview --config vite.static.config.ts --host 127.0.0.1 --port 4174 --strictPort
```

Expected: preview starts at `http://127.0.0.1:4174/`.

- [ ] **Step 2: Load real config from `.env.e2e.local`**

Use these environment variable names only:

```text
E2E_BASE_URL
E2E_API_KEY
E2E_TEXT_MODEL
E2E_IMAGE_MODEL
```

Do not paste actual values into terminal transcripts, docs, screenshots, or commits.

- [ ] **Step 3: Smoke test text-to-image single image**

Scenario:

```text
Prompt: generate one simple poster image with a short prompt.
Expected: one preview image appears, one image is saved, one history record is created.
```

Record only pass/fail, status, and sanitized error summary.

- [ ] **Step 4: Smoke test custom batch with two prompts**

Scenario:

```text
Prompt 1: a minimal coffee poster.
Prompt 2: a minimal mountain poster.
Concurrency: 1 or 2.
Expected: two tasks finish successfully, two history records are created.
```

Record success count, failure count, and whether history is created.

- [ ] **Step 5: Smoke test image-to-image**

Use a small local 128x128 PNG test image.

Expected:

```text
Success, or a provider-specific unsupported capability error.
The result must not be "image file is required".
```

- [ ] **Step 6: Smoke test AI planning**

Scenario:

```text
Initial task count: 3.
Main task contains four clearly separable targets.
Expected: AI planning auto-adjusts to 4 tasks.
```

- [ ] **Step 7: Write the verification report**

Create `docs/playwright-static-html-e2e-fix-verification-2026-07-06.zh-CN.md`:

```markdown
# 静态 HTML E2E 修复复测记录

日期：2026-07-06

## 命令

- `npm run test:run`
- `npm run build:static`
- `npm run site:check`

## 真实供应商 Smoke

- 文生图单图：
- 自定义多条提示词批量：
- 图生图：
- AI 任务规划：

## 保存目录人工验收

- 浏览器：
- 授权目录：
- 测试保存目录结果：
- 真实图片落点：
- 刷新后历史预览：

## 安全扫描

- 扫描命令：
- 扫描结果：

## 残余风险

-
```

Do not include real API keys, signed image URLs, private Base URL values, or private model names.

## Task 4: Complete Save Directory Manual Acceptance

**Files:**

- Modify: `docs/playwright-static-html-e2e-fix-verification-2026-07-06.zh-CN.md`
- Optional modify: `docs/playwright-static-html-e2e-plan.zh-CN.md`

- [ ] **Step 1: Prepare a safe output subfolder**

Use a subfolder instead of the Downloads root:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\Downloads\gpt-image-2-studio"
```

- [ ] **Step 2: Authorize the folder in Chrome or Edge**

Open the static preview, go to Settings, click folder authorization, and choose:

```text
C:\Users\<User>\Downloads\gpt-image-2-studio
```

- [ ] **Step 3: Run test output directory**

Expected:

```text
The page reports write/read success.
A small test file or test image appears in the authorized folder.
```

- [ ] **Step 4: Generate one real image**

Expected:

```text
The generated image appears in the authorized folder, not directly under Downloads root.
```

- [ ] **Step 5: Refresh and restore history preview**

Expected:

```text
After refresh, clicking the history item restores preview from the authorized folder.
```

- [ ] **Step 6: Record result in the verification report**

Update the `保存目录人工验收` section with concrete pass/fail results.

## Task 5: Clarify Batch Failure Semantics

**Files:**

- Modify: `src/runtime/webAdapter.ts`
- Modify: `src/runtime/webAdapter.test.ts`
- Optional modify: `src/i18n/translations.ts`

- [ ] **Step 1: Write a failing test for save failure wording**

Add a test where provider image data is a URL and browser fetch fails:

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
).rejects.toThrow("could not download it");
```

- [ ] **Step 2: Add user-facing distinction if current wording is still vague**

If batch UI still collapses this into generic failure, update the display layer so the task card shows:

```text
模型可能已返回结果，但浏览器保存图片失败。请检查保存目录授权或供应商是否支持 b64_json 返回，不要盲目重复重试。
```

English equivalent:

```text
The provider may have returned a result, but the browser could not save the image. Check folder authorization or b64_json support before retrying repeatedly.
```

- [ ] **Step 3: Run focused tests**

Run:

```powershell
npm run test:run -- src/runtime/webAdapter.test.ts
npm run test:run -- src/App.test.tsx
```

Expected: PASS.

## Task 6: Full Regression And Security Gate

**Files:**

- Modify: `docs/playwright-static-html-e2e-fix-verification-2026-07-06.zh-CN.md`
- Generated: `dist-static/gpt-image-2-studio-lite.html`
- Generated: `dist-static/index.html`
- Generated: `dist-static/versions/v0.1.4/index.html`

- [ ] **Step 1: Run all tests**

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

Expected: PASS and regenerate static files.

- [ ] **Step 3: Run static site check**

Run:

```powershell
npm run site:check
```

Expected: PASS.

- [ ] **Step 4: Run secret scan**

Run:

```powershell
rg -n "sk-[A-Za-z0-9_-]{24,}|1ts[A-Za-z0-9_-]{20,}" . --glob "!node_modules/**" --glob "!dist/**" --glob "!.git/**"
```

Expected: no real key. If the only matches are regex examples in docs, record that explicitly.

- [ ] **Step 5: Review final diff**

Run:

```powershell
git diff -- src/core/apiClient.ts src/core/apiClient.test.ts src/runtime/webAdapter.ts src/runtime/webAdapter.test.ts src/i18n/translations.ts docs dist-static
```

Expected:

```text
No real secrets.
No signed provider image URLs.
No private provider Base URL.
No private model names.
Static HTML was rebuilt after source changes.
```

## Task 7: Align Archived Static Version Artifacts

**Files:**

- Modify: `static-versions/versions/v0.1.4/index.html`
- Generated: `dist-static/versions/v0.1.4/index.html`

- [ ] **Step 1: Confirm whether the archived version is stale**

Run:

```powershell
rg -n "image\[\]|response_format|b64_json" static-versions\versions\v0.1.4\index.html dist-static\versions\v0.1.4\index.html
```

Expected before the fix if the archive is stale:

```text
static-versions\versions\v0.1.4\index.html contains image[] or lacks response_format/b64_json.
dist-static\versions\v0.1.4\index.html contains response_format and b64_json and does not contain image[].
```

- [ ] **Step 2: Copy the rebuilt fixed version into the source archive**

Run:

```powershell
Copy-Item -Force dist-static\versions\v0.1.4\index.html static-versions\versions\v0.1.4\index.html
```

Rationale:

```text
The dist artifact is generated from the current fixed build. The static-versions archive is the versioned source artifact that GitHub Pages can serve as a fixed old-version route. It must not keep the old image[] multipart behavior.
```

- [ ] **Step 3: Verify the archived version no longer contains the old multipart field**

Run:

```powershell
rg -n "image\[\]" static-versions\versions\v0.1.4\index.html dist-static\versions\v0.1.4\index.html
```

Expected: no output.

- [ ] **Step 4: Verify both archived artifacts contain base64 response mode**

Run:

```powershell
rg -n "response_format|b64_json" static-versions\versions\v0.1.4\index.html dist-static\versions\v0.1.4\index.html
```

Expected:

```text
Both files contain response_format and b64_json references.
```

- [ ] **Step 5: Run static site check after archive alignment**

Run:

```powershell
npm run site:check
```

Expected: PASS.

- [ ] **Step 6: Include archive alignment in the verification report**

Update `docs/playwright-static-html-e2e-fix-verification-2026-07-06.zh-CN.md` under `命令` or `残余风险`:

```markdown
- 版本归档一致性：已确认 `static-versions/versions/v0.1.4/index.html` 与 `dist-static/versions/v0.1.4/index.html` 均不再包含 `image[]`，并包含 `response_format: b64_json` 链路。
```

## Self-Review Checklist

- [ ] Every P1 item in the diagnostic report has either a code fix or a documented manual verification boundary.
- [ ] Every P2 item has at least a test or wording improvement.
- [ ] Real provider smoke report exists and is sanitized.
- [ ] Save directory behavior is not described as a normal typed path feature; it is documented as browser folder authorization.
- [ ] Versioned static archives are aligned with the rebuilt fixed HTML and do not retain stale request behavior.
- [ ] `npm run test:run`, `npm run build:static`, and `npm run site:check` pass before claiming completion.
- [ ] Final secret scan passes before commit or push.
