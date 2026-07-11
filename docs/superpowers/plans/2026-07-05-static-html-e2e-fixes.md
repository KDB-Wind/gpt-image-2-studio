# Static HTML E2E Fixes Implementation Plan

> **历史材料：** 本文已被 2026-07-11 独立审计与修复取代，仅保留用于追溯，不代表当前验证结论。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复静态 HTML 真实文生图、图生图和错误诊断问题，让真实供应商调用能返回 base64、保存到本地、进入历史，并保留保存目录的可验证路径。

**Architecture:** 修复集中在 API 请求构造与浏览器保存适配层。图片生成和编辑请求统一请求 `b64_json`，浏览器优先处理 base64；若供应商仍返回 URL 且浏览器跨域下载失败，则转换为清晰错误文案。保存目录不做不现实的强制本地路径写入，只补足自动化与人工验收边界。

**Tech Stack:** React 19, TypeScript, Vite 8, Vitest, Playwright 临时脚本, File System Access API, OpenAI-compatible image API.

---

## File Structure

- Modify: `src/core/apiClient.ts`
  - 给文生图 JSON 请求和图生图 multipart 请求加入 `response_format: "b64_json"`。
  - 把图生图图片字段从 `image[]` 改为重复的 `image` 字段。
- Modify: `src/core/apiClient.test.ts`
  - 更新请求体测试，先写失败断言，再改实现。
  - 增加多图字段名兼容测试。
- Modify: `src/runtime/webAdapter.ts`
  - 给 URL 图片下载失败增加可读错误，明确区分“模型返回 URL 成功”和“浏览器跨域下载失败”。
- Modify: `src/runtime/webAdapter.test.ts`
  - 增加 URL fetch 失败错误信息测试。
  - 保留现有授权目录、fallback、历史恢复测试。
- Modify: `src/i18n/translations.ts`
  - 如果 UI 层需要展示更清晰的保存失败信息，补齐中英文文案。
- Modify: `docs/playwright-static-html-e2e-plan.zh-CN.md`
  - 补充修复后的人工复测项，尤其是保存目录授权。
- Create: `docs/playwright-static-html-e2e-fix-verification-2026-07-05.zh-CN.md`
  - 记录修复后的复测结论、命令、真实调用结果和密钥扫描结果。

## Task 1: Fix Text-To-Image Response Format

**Files:**
- Modify: `src/core/apiClient.test.ts`
- Modify: `src/core/apiClient.ts`

- [ ] **Step 1: Write the failing test for `response_format`**

In `src/core/apiClient.test.ts`, update the `buildImageGenerationRequest` expectation:

```ts
expect(
  buildImageGenerationRequest({
    model: "gpt-image-2",
    prompt: "A cinematic skyline at dusk.",
    size: "1024x1024",
    quality: "high",
    n: 2,
    outputFormat: "webp",
    outputCompression: 85,
  }),
).toEqual({
  model: "gpt-image-2",
  prompt: "A cinematic skyline at dusk.",
  size: "1024x1024",
  quality: "high",
  n: 2,
  output_format: "webp",
  output_compression: 85,
  response_format: "b64_json",
});
```

Also update the PNG expectation:

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
  output_format: "png",
  response_format: "b64_json",
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```powershell
npm run test:run -- src/core/apiClient.test.ts -t "buildImageGenerationRequest"
```

Expected: FAIL because the implementation does not yet include `response_format`.

- [ ] **Step 3: Add `response_format` to image generation requests**

In `src/core/apiClient.ts`, change `buildImageGenerationRequest()` payload:

```ts
const payload: Record<string, string | number> = {
  model,
  prompt,
  size,
  quality,
  n,
  output_format: outputFormat,
  response_format: "b64_json",
};
```

- [ ] **Step 4: Run the focused test and confirm it passes**

Run:

```powershell
npm run test:run -- src/core/apiClient.test.ts -t "buildImageGenerationRequest"
```

Expected: PASS.

## Task 2: Fix Image Edit Multipart Compatibility

**Files:**
- Modify: `src/core/apiClient.test.ts`
- Modify: `src/core/apiClient.ts`

- [ ] **Step 1: Update the single-reference-image test**

In `src/core/apiClient.test.ts`, replace the `image[]` assertion in `buildImageEditRequest`:

```ts
expect(payload.get("response_format")).toBe("b64_json");
expect(payload.getAll("image[]")).toHaveLength(0);

const images = payload.getAll("image");
expect(images).toHaveLength(1);
expect(images[0]).toBeInstanceOf(File);
expect((images[0] as File).name).toBe("reference.png");
```

- [ ] **Step 2: Update the multiple-reference-images test**

Change the test name to `appends multiple reference images under repeated image fields`, then assert:

```ts
expect(payload.get("output_compression")).toBe("72");
expect(payload.get("response_format")).toBe("b64_json");
expect(payload.getAll("image[]")).toHaveLength(0);
expect(payload.getAll("image").map((item) => (item as File).name)).toEqual([
  "one.png",
  "two.png",
  "three.png",
]);
```

- [ ] **Step 3: Update generateImages and testImageEditModel assertions**

In the `generateImages` test, replace:

```ts
expect(formData.getAll("image[]")).toHaveLength(1);
```

with:

```ts
expect(formData.get("response_format")).toBe("b64_json");
expect(formData.getAll("image[]")).toHaveLength(0);
expect(formData.getAll("image")).toHaveLength(1);
```

In the `testImageEditModel` tests, replace:

```ts
const images = formData.getAll("image[]");
```

with:

```ts
expect(formData.get("response_format")).toBe("b64_json");
expect(formData.getAll("image[]")).toHaveLength(0);
const images = formData.getAll("image");
```

And replace:

```ts
const image = formData.getAll("image[]")[0] as File;
```

with:

```ts
const image = formData.getAll("image")[0] as File;
```

- [ ] **Step 4: Run the focused tests and confirm they fail**

Run:

```powershell
npm run test:run -- src/core/apiClient.test.ts -t "buildImageEditRequest|generateImages|testImageEditModel"
```

Expected: FAIL because implementation still uses `image[]` and does not set `response_format`.

- [ ] **Step 5: Update `buildImageEditRequest()` implementation**

In `src/core/apiClient.ts`, add:

```ts
payload.set("response_format", "b64_json");
```

Then replace:

```ts
payload.append("image[]", image, image.name);
```

with:

```ts
payload.append("image", image, image.name);
```

- [ ] **Step 6: Run the focused tests and confirm they pass**

Run:

```powershell
npm run test:run -- src/core/apiClient.test.ts -t "buildImageEditRequest|generateImages|testImageEditModel"
```

Expected: PASS.

## Task 3: Improve URL Fetch Failure Diagnostics

**Files:**
- Modify: `src/runtime/webAdapter.test.ts`
- Modify: `src/runtime/webAdapter.ts`

- [ ] **Step 1: Add a failing test for URL fetch failure**

In `src/runtime/webAdapter.test.ts`, add a test near existing `saveImage` tests:

```ts
it("explains when a provider image URL cannot be downloaded by the browser", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")),
  );

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
  ).rejects.toThrow("The provider returned an image URL, but this browser could not download it");
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```powershell
npm run test:run -- src/runtime/webAdapter.test.ts -t "provider image URL"
```

Expected: FAIL because current error is only `Failed to fetch`.

- [ ] **Step 3: Add a URL fetch helper**

In `src/runtime/webAdapter.ts`, replace the URL branch in `imageToBlob()`:

```ts
if (input.image.url) {
  const response = await fetch(input.image.url);

  if (!response.ok) {
    throw new Error(`Failed to download generated image: HTTP ${response.status}.`);
  }

  return response.blob();
}
```

with:

```ts
if (input.image.url) {
  try {
    const response = await fetch(input.image.url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.blob();
  } catch (error) {
    const reason = getRuntimeErrorMessage(error);
    throw new Error(
      `The provider returned an image URL, but this browser could not download it. ` +
        `This is usually caused by CORS restrictions on the provider-hosted image. ` +
        `Use a provider or request mode that returns b64_json image data. Original error: ${reason}`,
    );
  }
}
```

- [ ] **Step 4: Run the focused test and confirm it passes**

Run:

```powershell
npm run test:run -- src/runtime/webAdapter.test.ts -t "provider image URL"
```

Expected: PASS.

## Task 4: Update Existing API Client Snapshot Expectations

**Files:**
- Modify: `src/core/apiClient.test.ts`

- [ ] **Step 1: Update `testImageModel` expected request body**

In `src/core/apiClient.test.ts`, update the expected JSON body:

```ts
expect(requestInit.body).toBe(
  JSON.stringify({
    model: "gpt-image-1",
    prompt: "A plain single-color square swatch image.",
    size: "1024x1024",
    quality: "medium",
    n: 1,
    output_format: "png",
    response_format: "b64_json",
  }),
);
```

- [ ] **Step 2: Run all API client tests**

Run:

```powershell
npm run test:run -- src/core/apiClient.test.ts
```

Expected: PASS.

## Task 5: Preserve Save Directory Boundary In Tests And Docs

**Files:**
- Modify: `src/runtime/webAdapter.test.ts`
- Modify: `docs/playwright-static-html-e2e-plan.zh-CN.md`

- [ ] **Step 1: Verify existing File System Access tests still pass**

Run:

```powershell
npm run test:run -- src/runtime/webAdapter.test.ts
```

Expected: PASS.

- [ ] **Step 2: Add manual verification notes to E2E plan**

Append this section to `docs/playwright-static-html-e2e-plan.zh-CN.md`:

```markdown
## 修复后保存目录人工复测

Playwright 普通脚本不能直接操作浏览器原生 `showDirectoryPicker()` 目录选择器，因此保存目录真实落点必须人工复测：

1. 使用 Chrome 或 Edge 打开本地预览或 GitHub Pages 页面。
2. 在 `C:\Users\<User>\Downloads` 下新建 `gpt-image-2-studio` 子目录，不要直接授权 Downloads 根目录。
3. 进入“设置”，点击“选择并授权目录”，选择该子目录。
4. 点击“测试保存目录”，确认测试图片可以写入并读回。
5. 执行一次真实文生图。
6. 确认图片实际出现在授权目录下，而不是浏览器默认 Downloads 根目录。
7. 刷新页面，进入历史，点击刚才的记录，确认可以恢复预览。
```

- [ ] **Step 3: Confirm the doc does not contain secrets**

Run:

```powershell
rg -n "sk-[A-Za-z0-9_-]{24,}|1ts[A-Za-z0-9_-]{20,}" docs/playwright-static-html-e2e-plan.zh-CN.md
```

Expected: no output.

## Task 6: Full Local Verification

**Files:**
- No code changes unless tests reveal a regression.

- [ ] **Step 1: Run unit tests**

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

Expected: PASS and regenerate `dist-static/gpt-image-2-studio-lite.html`.

- [ ] **Step 3: Run static site check**

Run:

```powershell
npm run site:check
```

Expected: PASS.

- [ ] **Step 4: Run final secret scan**

Run:

```powershell
rg -n "sk-[A-Za-z0-9_-]{24,}|1ts[A-Za-z0-9_-]{20,}" . --glob "!node_modules/**" --glob "!dist/**" --glob "!.git/**"
```

Expected: no real key. If the only matches are examples or environment variable names, record them in the verification report.

## Task 7: Real Provider Smoke Verification

**Files:**
- Create: `docs/playwright-static-html-e2e-fix-verification-2026-07-05.zh-CN.md`

- [ ] **Step 1: Start static preview**

Run:

```powershell
npm exec -- vite preview --config vite.static.config.ts --host 127.0.0.1 --port 4174 --strictPort
```

Expected: preview starts at `http://127.0.0.1:4174/`.

- [ ] **Step 2: Run the existing Playwright smoke script or manual smoke**

Use `.env.e2e.local` for:

```text
E2E_BASE_URL
E2E_API_KEY
E2E_TEXT_MODEL
E2E_IMAGE_MODEL
```

Do not copy actual values into logs or docs.

Minimum scenarios:

```text
1. Text-to-image single image: expect one successful preview and one history record.
2. Custom batch with two prompts: expect two successful images and two history records.
3. Image-to-image with one 128x128 PNG: expect either success or a provider-specific error that is not "image file is required".
4. AI planning: start with task count 3 and a four-item task; expect auto-adjust to 4.
```

- [ ] **Step 3: Write verification report**

Create `docs/playwright-static-html-e2e-fix-verification-2026-07-05.zh-CN.md` with this exact structure:

```markdown
# 静态 HTML E2E 修复复测记录

日期：2026-07-05

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

Fill each bullet with the actual result. Do not paste API keys, signed image URLs, or full provider private responses.

## Self-Review Checklist

- [ ] Spec coverage: P1-001, P1-002, P1-003, P2-001, P2-002 all map to tasks.
- [ ] No provider secret, API key, signed URL, or private model identifier is written into committed docs.
- [ ] Tests are updated before implementation changes.
- [ ] Static HTML is rebuilt after TypeScript changes.
- [ ] Save directory is treated as browser-permission-bound behavior, not a normal local path input.
