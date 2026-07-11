# Static HTML Page-Level E2E Hardening Implementation Plan

> **历史材料：** 本文已被 2026-07-11 独立审计与修复取代，仅保留用于追溯，不代表当前验证结论。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐静态 HTML 版剩余 E2E 缺口：页面级预览/历史/保存目录验收、URL 错误脱敏、base64 保存链路回归测试、版本归档自动一致性检查。

**Architecture:** 保持纯静态网页架构，不引入后端代理。安全脱敏放在 `src/runtime/webAdapter.ts`，base64 端到端测试覆盖 `src/core/apiClient.ts` 到 `src/runtime/webAdapter.ts` 的关键链路，版本归档一致性放进 `scripts/static-site-check.mjs`，页面级验收结果写入复测文档。

**Tech Stack:** React 19, TypeScript, Vite 8, Vitest, File System Access API, OpenAI-compatible image API, PowerShell, Chrome/Edge manual acceptance.

---

## File Structure

- Modify: `src/runtime/webAdapter.ts`
  - 增加运行时错误消息脱敏，避免嵌套错误中泄露签名 URL 或 token。
- Modify: `src/runtime/webAdapter.test.ts`
  - 增加 URL-bearing error message 脱敏测试。
  - 增加 base64 图片保存链路测试，证明不触发 provider URL fetch。
- Modify: `src/core/apiClient.test.ts`
  - 把 `generateImages()` 和 `testImageEditModel()` 的成功 mock 响应改为 `b64_json`，锁定请求和解析后的 base64 路径。
- Modify: `scripts/static-site-check.mjs`
  - 增加 `static-versions/versions/v${packageJson.version}/index.html` 与 `dist-static/versions/v${packageJson.version}/index.html` 一致性检查。
- Modify: `docs/playwright-static-html-e2e-fix-verification-2026-07-05.zh-CN.md`
  - 明确当前 Task 7 未完成。
  - 补充后续页面级 smoke 与保存目录人工验收结果。

## Task 1: Redact Nested URL-Bearing Runtime Errors

**Files:**

- Modify: `src/runtime/webAdapter.ts`
- Modify: `src/runtime/webAdapter.test.ts`

- [ ] **Step 1: Write the failing redaction test**

In `src/runtime/webAdapter.test.ts`, add this test near the existing provider URL download tests:

```ts
it("redacts provider URLs that appear inside nested runtime error messages", async () => {
  const providerUrl = "https://provider.example/generated.png?signature=private-token";
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValueOnce(new TypeError(`Failed to fetch ${providerUrl}`)),
  );

  let message = "";
  try {
    await webAdapter.saveImage({
      image: { url: providerUrl },
      prompt: "A small test image.",
      optimizedPrompt: "",
      customName: "",
      config: DEFAULT_CONFIG,
      generatedAt: new Date("2026-07-06T10:00:00.000Z"),
      durationMs: 1200,
    });
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }

  expect(message).toContain("The provider returned an image URL, but this browser could not download it");
  expect(message).toContain("b64_json");
  expect(message).not.toContain(providerUrl);
  expect(message).not.toContain("private-token");
  expect(message).not.toContain("provider.example/generated.png");
});
```

- [ ] **Step 2: Run focused test and verify failure**

Run:

```powershell
npm run test:run -- src/runtime/webAdapter.test.ts -t "redacts provider URLs"
```

Expected: FAIL because `Original error` still includes the raw URL-bearing error message.

- [ ] **Step 3: Implement minimal error redaction**

In `src/runtime/webAdapter.ts`, add:

```ts
function redactRuntimeErrorMessage(message: string): string {
  return message
    .replace(/https?:\/\/[^\s"'<>]+/g, "[redacted-url]")
    .replace(/([?&](?:signature|token|key|api_key|access_token)=)[^&\s]+/gi, "$1[redacted]");
}
```

Then change:

```ts
const reason = getRuntimeErrorMessage(error);
```

to:

```ts
const reason = redactRuntimeErrorMessage(getRuntimeErrorMessage(error));
```

- [ ] **Step 4: Run focused test and verify pass**

Run:

```powershell
npm run test:run -- src/runtime/webAdapter.test.ts -t "redacts provider URLs|provider image URL"
```

Expected: PASS. Existing `HTTP 403` diagnostic must still include `HTTP 403`, but no full provider URL.

## Task 2: Prove Base64 Save Path End-To-End

**Files:**

- Modify: `src/core/apiClient.test.ts`
- Modify: `src/runtime/webAdapter.test.ts`

- [ ] **Step 1: Update image generation mock to return base64**

In `src/core/apiClient.test.ts`, in the `testImageModel` test, replace the mock response:

```ts
data: [{ url: "https://example.com/swatch.png" }],
```

with:

```ts
data: [{ b64_json: "YmFzZTY0LXN3YXRjaA==" }],
```

And replace the expectation:

```ts
await expect(testImageModel(config)).resolves.toEqual([
  { url: "https://example.com/swatch.png" },
]);
```

with:

```ts
await expect(testImageModel(config)).resolves.toEqual([
  { base64: "YmFzZTY0LXN3YXRjaA==" },
]);
```

- [ ] **Step 2: Update image edit mock to return base64**

In `src/core/apiClient.test.ts`, in the `generateImages` image-edit test, replace:

```ts
data: [{ url: "https://example.com/edited.png" }],
```

with:

```ts
data: [{ b64_json: "YmFzZTY0LWVkaXQ=" }],
```

And replace the expectation:

```ts
).resolves.toEqual([{ url: "https://example.com/edited.png" }]);
```

with:

```ts
).resolves.toEqual([{ base64: "YmFzZTY0LWVkaXQ=" }]);
```

- [ ] **Step 3: Add base64 save test without provider URL fetch**

In `src/runtime/webAdapter.test.ts`, add:

```ts
it("saves base64 provider images without fetching a provider URL", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:base64-save");

  const result = await webAdapter.saveImage({
    image: { base64: ONE_PIXEL_PNG },
    prompt: "A base64 image.",
    optimizedPrompt: "",
    customName: "base64-image",
    config: { ...DEFAULT_CONFIG, defaultFormat: "png" },
    generatedAt: new Date("2026-07-06T10:30:00.000Z"),
    durationMs: 1000,
  });

  expect(fetchMock).not.toHaveBeenCalled();
  expect(result.previewUrl).toBe("blob:base64-save");
  await expect(webAdapter.loadHistory()).resolves.toEqual([
    expect.objectContaining({
      prompt: "A base64 image.",
      outputPath: expect.stringContaining("base64-image"),
    }),
  ]);
});
```

- [ ] **Step 4: Run focused tests**

Run:

```powershell
npm run test:run -- src/core/apiClient.test.ts
npm run test:run -- src/runtime/webAdapter.test.ts
```

Expected: PASS.

## Task 3: Guard Static Version Source Consistency

**Files:**

- Modify: `scripts/static-site-check.mjs`

- [ ] **Step 1: Add source archive path constants**

In `scripts/static-site-check.mjs`, after `const distDir = ...`, add:

```js
const staticVersionsDir = resolve(rootDir, "static-versions");
const currentVersionPath = `versions/v${packageJson.version}/index.html`;
```

Then update `requiredFiles` to use `currentVersionPath`:

```js
const requiredFiles = ["index.html", "gpt-image-2-studio-lite.html", currentVersionPath];
```

- [ ] **Step 2: Add archive consistency assertion**

In `scripts/static-site-check.mjs`, add:

```js
function assertStaticVersionSourceParity() {
  const distVersionFile = join(distDir, currentVersionPath);
  const sourceVersionFile = join(staticVersionsDir, currentVersionPath);

  if (!existsSync(sourceVersionFile)) {
    throw new Error(`Static version source is missing: ${sourceVersionFile}`);
  }

  const distVersionHtml = readFileSync(distVersionFile, "utf8");
  const sourceVersionHtml = readFileSync(sourceVersionFile, "utf8");

  if (distVersionHtml !== sourceVersionHtml) {
    throw new Error(
      `static-versions/${currentVersionPath} must match dist-static/${currentVersionPath}. ` +
        `Run npm run build:static and copy the rebuilt version archive before publishing.`,
    );
  }
}
```

Then call it after `assertSingleFileParity()`:

```js
assertStaticVersionSourceParity();
```

- [ ] **Step 3: Run site check**

Run:

```powershell
npm run build:static
Copy-Item -Force dist-static\versions\v0.1.4\index.html static-versions\versions\v0.1.4\index.html
npm run site:check
```

Expected: PASS.

## Task 4: Complete Page-Level Smoke And Save Directory Acceptance

**Files:**

- Modify: `docs/playwright-static-html-e2e-fix-verification-2026-07-05.zh-CN.md`

- [ ] **Step 1: Start static preview**

Run:

```powershell
npm run build:static
npm exec -- vite preview --config vite.static.config.ts --host 127.0.0.1 --port 4174 --strictPort
```

Expected: preview starts at `http://127.0.0.1:4174/`.

- [ ] **Step 2: Run page-level text-to-image smoke**

Manual or Playwright-assisted steps:

```text
1. Open http://127.0.0.1:4174/.
2. Fill settings from .env.e2e.local without writing values into docs.
3. Generate one short text-to-image prompt.
4. Confirm the middle preview panel shows the generated image.
5. Open History and confirm one new history record exists.
```

Expected: page preview exists and history record exists. API-level success alone is not sufficient.

- [ ] **Step 3: Run page-level custom batch smoke**

Manual or Playwright-assisted steps:

```text
1. Open Batch.
2. Select custom multiple prompts.
3. Use two short prompts.
4. Set concurrency to 1.
5. Start batch generation.
6. Confirm two task previews appear.
7. Open History and confirm two new batch records exist.
```

Expected: success count is 2, failure count is 0, history records are visible.

- [ ] **Step 4: Run page-level image-to-image smoke**

Manual or Playwright-assisted steps:

```text
1. Open Single Image.
2. Switch to image-to-image.
3. Upload a 128x128 PNG.
4. Generate with a short edit prompt.
5. Confirm success, or record a provider-specific unsupported-capability error.
```

Expected: must not fail with `image file is required`.

- [ ] **Step 5: Run real save-directory acceptance in Chrome or Edge**

Manual steps:

```text
1. Create C:\Users\<User>\Downloads\gpt-image-2-studio.
2. In Settings, click folder authorization and choose that subfolder.
3. Click test output directory.
4. Confirm the test image exists in the authorized subfolder.
5. Generate one real image.
6. Confirm the image lands in the authorized subfolder, not directly in Downloads root.
7. Refresh page.
8. Open History and confirm the old image preview can be restored from the authorized folder.
```

Expected: all eight steps pass. If any step fails, record actual behavior and do not mark Task 7 complete.

- [ ] **Step 6: Update verification report**

In `docs/playwright-static-html-e2e-fix-verification-2026-07-05.zh-CN.md`, replace the current “未完成真实人工验收” lines with actual results. Keep this boundary if still not done:

```markdown
- 页面级 smoke：已完成 / 未完成。
- 保存目录人工验收：已完成 / 未完成。
- 真实图片落点：授权目录 / 浏览器默认下载目录 / 未验证。
- 刷新后历史预览：可恢复 / 不可恢复 / 未验证。
```

Do not paste API keys, private Base URL, private model names, signed image URLs, or full provider responses.

## Task 5: Full Regression And Security Gate

**Files:**

- Generated: `dist-static/index.html`
- Generated: `dist-static/gpt-image-2-studio-lite.html`
- Generated: `dist-static/versions/v0.1.4/index.html`
- Modify: `static-versions/versions/v0.1.4/index.html`
- Modify: `docs/playwright-static-html-e2e-fix-verification-2026-07-05.zh-CN.md`

- [ ] **Step 1: Run all tests**

Run:

```powershell
npm run test:run
```

Expected: PASS.

- [ ] **Step 2: Build and sync static archives**

Run:

```powershell
npm run build:static
Copy-Item -Force dist-static\versions\v0.1.4\index.html static-versions\versions\v0.1.4\index.html
```

Expected: command succeeds.

- [ ] **Step 3: Run static site check**

Run:

```powershell
npm run site:check
```

Expected: PASS, including the new `static-versions` source parity check.

- [ ] **Step 4: Run final secret scan**

Run:

```powershell
rg -n "sk-[A-Za-z0-9_-]{24,}|1ts[A-Za-z0-9_-]{20,}" . --glob "!node_modules/**" --glob "!dist/**" --glob "!.git/**"
```

Expected: no real key. If docs contain regex examples only, record that explicitly.

- [ ] **Step 5: Review final diff**

Run:

```powershell
git diff -- src/runtime/webAdapter.ts src/runtime/webAdapter.test.ts src/core/apiClient.test.ts scripts/static-site-check.mjs docs static-versions dist-static
```

Expected:

```text
No real secrets.
No signed provider URLs.
No private provider Base URL.
No private model names.
Static archive source and dist archive are synchronized.
Task 7 page-level status is honestly recorded.
```

## Self-Review Checklist

- [ ] P1-004 has a failing test first, then a passing redaction implementation.
- [ ] P2-003 proves base64 save path without provider URL fetch.
- [ ] P2-004 is guarded by `npm run site:check`, not just manual `rg`.
- [ ] Page-level smoke is not replaced by API-level smoke.
- [ ] Save-directory acceptance is marked complete only after real Chrome/Edge manual verification.
- [ ] Verification docs contain no real key, private Base URL, private model name, signed image URL, or full provider response.
