# Static HTML Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复独立审计发现的发布阻断、供应商兼容、保存目录、批量一致性和安全问题，使静态 HTML 版具备可信的自动化证据、真实目录验收和不可变版本回退。

**Architecture:** 保持 React + RuntimeAdapter + 单文件静态构建架构，不引入后端。把“官方 API 契约”和“中转站兼容行为”显式分层；把生成成功与本地保存结果分开建模；把固定版本归档从普通 build 中剥离；把 mock 页面 E2E 设为 Pages 发布门禁，真实供应商和原生目录权限作为独立受控验收。

**Tech Stack:** React 19、TypeScript 6、Vite 8、Vitest 4、Playwright 1.61、GitHub Actions、File System Access API。

---

## File Map

- Modify: `package.json` - 拆分 build、mock E2E、真实供应商 E2E 和版本归档命令。
- Modify: `playwright.static.config.ts` - 禁止复用旧服务，增加桌面与手机 mock project。
- Create: `playwright.static.real-provider.config.ts` - 真实供应商专用无 artifact 配置。
- Modify: `tests/e2e/static-html-real-provider.spec.ts` - 修复图生图假阳性和环境加载顺序。
- Modify: `tests/e2e/static-html-page.spec.ts` - 增加失败重试、批量图生图、刷新恢复和保存回退。
- Create: `tests/e2e/static-html-file-page.spec.ts` - 直接打开 Release HTML 的 file 模式测试。
- Modify: `.github/workflows/pages.yml` - 把 mock 页面 E2E 加入部署门禁。
- Modify: `src/core/config.ts` - 增加图片响应兼容模式和 API key 持久化策略。
- Modify: `src/core/apiClient.ts` - 默认省略 GPT Image 不支持的 response_format。
- Modify: `src/core/apiClient.test.ts` - 覆盖官方模式和中转兼容模式。
- Modify: `src/core/batchTypes.ts` - 保存批量任务的保存方式和回退原因。
- Modify: `src/core/batchRunner.ts` - 传播保存结果并修复重试状态更新接口。
- Modify: `src/core/batchPromptSplitter.ts` - 校验推荐数量与有效 items。
- Modify: `src/components/BatchPanel.tsx` - 修复重试竞态、计数矛盾和 Blob URL 回收。
- Modify: `src/App.tsx` - 统一错误脱敏、API key 存储 UI、保存状态和单图 URL 回收。
- Modify: `src/runtime/webAdapter.ts` - 分离秘密存储、目录权限状态和保存回退。
- Modify: `src/runtime/types.ts` - 增加目录状态与批量保存结果类型。
- Create: `src/core/errorSanitizer.ts` - 统一供应商错误分类和脱敏。
- Create: `src/core/errorSanitizer.test.ts` - 覆盖 token、签名 URL 和长响应。
- Create: `src/core/blobUrl.ts` - 集中管理 Blob URL 回收。
- Create: `src/core/blobUrl.test.ts` - 验证只回收本应用持有的 Blob URL。
- Modify: `scripts/inline-static-html.mjs` - build 不再覆盖固定版本归档。
- Create: `scripts/archive-static-version.mjs` - 显式创建且默认拒绝覆盖固定版本。
- Modify: `scripts/static-site-check.mjs` - 校验所有归档复制一致性，不要求旧版本等于 latest。
- Create: `scripts/secret-scan.mjs` - 统一扫描源码、文档和 dist。
- Modify: `scripts/release-readiness.mjs` - 使用统一密钥扫描并校验 tag/version/release notes。
- Modify: `.github/workflows/release.yml` - 动态使用当前版本说明。
- Modify: `vite.config.ts`, `vite.static.config.ts` - 注入版本常量，不打包完整 package.json。
- Modify: `package.json` - license 改为 MIT，并在正式归档时升级版本。
- Modify: `docs/static-html-gpt56-independent-audit-2026-07-11.zh-CN.md` - 逐项更新证据状态。

### Task 1: Repair E2E Integrity And Pages Gate

**Execution status:** completed and reviewed。真实页面等待逻辑、专用配置和 Pages 门禁已由 Task 10 自动化证据复核；下方 checkbox 保留原始执行步骤，不作为当前状态来源。

- [ ] **Step 1: Write a failing real image-to-image assertion**

把真实图生图测试改为等待真实请求和最终预览：

```ts
const responsePromise = page.waitForResponse(
  (response) =>
    response.request().method() === "POST"
    && response.url().includes("/images/edits"),
  { timeout: 180_000 },
);

await page.getByTestId("single-generate").click();
const response = await responsePromise;
expect(response.ok()).toBe(true);
await expect(page.locator(".preview-panel img").first()).toBeVisible({ timeout: 180_000 });
```

- [ ] **Step 2: Run only the test and confirm the old implementation fails honestly**

Run:

```powershell
$env:E2E_REAL_PROVIDER='1'
npx playwright test tests/e2e/static-html-real-provider.spec.ts --config=playwright.static.real-provider.config.ts --grep "real image-to-image"
```

Expected: 在新的等待断言生效后，测试必须等待真实响应；供应商不支持时明确 FAIL，不能在 1 秒内假通过。

- [ ] **Step 3: Load .env before deciding whether to skip**

在 test file 顶层先调用环境加载函数，再计算：

```ts
loadDotEnvE2eLocal();
const runRealProvider = process.env.E2E_REAL_PROVIDER === "1";

test.describe("real provider static page smoke", () => {
  test.skip(!runRealProvider, "Set E2E_REAL_PROVIDER=1 to run real provider page smoke.");
});
```

- [ ] **Step 4: Separate mock and real-provider Playwright configs**

真实供应商配置必须关闭敏感 artifact：

```ts
use: {
  baseURL: "http://127.0.0.1:4174",
  screenshot: "off",
  trace: "off",
  video: "off",
}
```

mock 配置使用固定端口并设置 `reuseExistingServer: false`。

- [ ] **Step 5: Make E2E build the current source**

在 `package.json` 增加：

```json
{
  "e2e:static:mock:run": "playwright test tests/e2e/static-html-page.spec.ts --config=playwright.static.config.ts",
  "e2e:static:mock": "npm run build:static && npm run e2e:static:mock:run",
  "e2e:static:file:run": "playwright test tests/e2e/static-html-file-page.spec.ts --config=playwright.static.config.ts",
  "e2e:static:file": "npm run build:static && npm run e2e:static:file:run",
  "e2e:static:real": "npm run build:static && playwright test tests/e2e/static-html-real-provider.spec.ts --config=playwright.static.real-provider.config.ts"
}
```

- [ ] **Step 6: Add mock E2E to GitHub Pages**

在 `.github/workflows/pages.yml` 的 build 后加入：

```yaml
- name: Run static page E2E
  run: npm run e2e:static:mock:run
```

- [ ] **Step 7: Verify**

Run:

```powershell
npm run e2e:static:mock
npm run e2e:static:file
```

Expected: 当前源码先构建；测试不会复用旧 4174 服务；所有 mock E2E 通过。

- [ ] **Step 8: Commit**

```powershell
git add package.json package-lock.json playwright.static.config.ts playwright.static.real-provider.config.ts tests/e2e .github/workflows/pages.yml
git commit -m "test: make static page e2e a trustworthy release gate"
```

### Task 2: Restore Official Image API Compatibility

**Execution status:** completed and reviewed。请求契约与兼容模式由单元测试和 Task 10 全量测试复核。

- [ ] **Step 1: Add failing request-construction tests**

```ts
const baseImageInput = {
  model: "gpt-image-2",
  prompt: "A blue circle",
  size: "1024x1024",
  quality: "high" as const,
  n: 1,
  outputFormat: "png" as const,
  outputCompression: 90,
};

it("omits response_format in official GPT Image mode", () => {
  expect(
    buildImageGenerationRequest({ ...baseImageInput, responseMode: "official" }),
  ).not.toHaveProperty("response_format");
});

it("adds b64_json only in relay compatibility mode", () => {
  expect(
    buildImageGenerationRequest({ ...baseImageInput, responseMode: "force-base64" }),
  ).toMatchObject({ response_format: "b64_json" });
});
```

对 multipart form 重复相同断言。

- [ ] **Step 2: Run focused tests and confirm failure**

Run:

```powershell
npx vitest run src/core/apiClient.test.ts
```

Expected: 默认省略 response_format 的断言失败。

- [ ] **Step 3: Add explicit config**

在 `AppConfig` 中加入：

```ts
export type ImageResponseMode = "official" | "force-base64";

imageResponseMode: ImageResponseMode;
```

同时给 `ImageRequestInput` 增加 `responseMode: ImageResponseMode`。默认配置必须是 `official`，`generateImages()` 将 `config.imageResponseMode` 显式传给 `buildImageGenerationRequest()` 和 `buildImageEditRequest()`。

- [ ] **Step 4: Apply the mode to JSON and multipart requests**

```ts
if (config.imageResponseMode === "force-base64") {
  payload.response_format = "b64_json";
}
```

multipart 使用同一条件，不按 Base URL 或模型名称猜测。

- [ ] **Step 5: Add settings UI and bilingual copy**

名称建议：

- 中文：`图片响应兼容模式`
- 默认：`官方 GPT Image 模式`
- 可选：`中转站强制 base64`

帮助文字必须说明：只有供应商明确要求时才开启。

- [ ] **Step 6: Verify**

```powershell
npx vitest run src/core/apiClient.test.ts src/App.test.tsx
npm run build:static
```

Expected: 两种模式均通过；默认构建不再无条件包含该字段。

- [ ] **Step 7: Commit**

```powershell
git add src/core/config.ts src/core/apiClient.ts src/core/apiClient.test.ts src/App.tsx src/App.test.tsx src/i18n/translations.ts
git commit -m "fix: separate official image requests from relay compatibility"
```

### Task 3: Make Version Archives Immutable

**Execution status:** completed and reviewed。归档不可变性、manifest 和 source/dist parity 已由 Task 10 站点检查及哈希证据复核。

- [ ] **Step 1: Write archive script tests**

测试必须证明：

- 首次归档成功。
- 同一版本再次归档默认失败。
- 普通 `build:static` 不改写 `static-versions/versions/vX/index.html`。
- dist 中每个归档与 source archive 字节一致。

- [ ] **Step 2: Run tests and confirm current behavior fails**

```powershell
npx vitest run scripts/static-versioning.test.mjs
```

Expected: 当前 build 会覆盖当前版本路径，因此不可变测试失败。

- [ ] **Step 3: Stop inline build from creating current archive**

`scripts/inline-static-html.mjs` 只做：

```js
writeFileSync(htmlPath, html, "utf8");
writeFileSync(releaseHtmlPath, html, "utf8");
cpSync(archivedVersionsDir, distVersionsDir, { recursive: true });
```

删除普通 build 中写入 `versions/v<package-version>/index.html` 的逻辑。

- [ ] **Step 4: Add explicit archive command**

`archive-static-version.mjs` 必须：

1. 读取 package version。
2. 检查 latest HTML 已存在。
3. 如果 source archive 已存在则失败。
4. 复制 latest HTML 到 source archive。
5. 不接受默认覆盖。

在 `package.json` 增加：

```json
{
  "archive:static": "node scripts/archive-static-version.mjs"
}
```

- [ ] **Step 5: Add a version manifest**

```json
{
  "latestStable": "0.1.5",
  "versions": ["0.1.4", "0.1.5"]
}
```

页面版本切换读取构建时注入的 manifest，不用“当前 package version 一定已经归档”的假设。

- [ ] **Step 6: Update site check**

新检查规则：

- latest 与 release HTML 相同。
- dist 中每个固定版本与 source archive 相同。
- 不要求 latest 等于任何旧版本。
- manifest 中的版本均存在。

- [ ] **Step 7: Verify**

```powershell
npm run build:static
npm run site:check
npm run archive:static
```

Expected: 对已存在版本运行 archive 命令明确失败；升级 package version 后首次归档成功。

- [ ] **Step 8: Commit**

```powershell
git add scripts/inline-static-html.mjs scripts/archive-static-version.mjs scripts/static-site-check.mjs scripts/static-versioning.test.mjs static-versions package.json package-lock.json
git commit -m "fix: preserve immutable static version archives"
```

### Task 4: Make Save Results Truthful

**Execution status:** implementation completed and reviewed；原生目录人工验收仍 pending。保存结果、回退和 mock 目录路径已自动化复核，但下方原生验收步骤及 Task 10 native gate 不得标记完成。

- [ ] **Step 1: Add failing batch result tests**

```ts
expect(result.tasks[0]).toMatchObject({
  status: "succeeded",
  saveMode: "browser-download",
  saveFallbackReason: "permission denied",
});
```

另加 authorized-directory 成功用例。

- [ ] **Step 2: Add save fields to BatchTask and manifest**

```ts
saveMode?: "authorized-directory" | "browser-download";
saveFallbackReason?: string;
```

- [ ] **Step 3: Propagate runtime results in batchRunner**

```ts
return {
  ...runningTask,
  status: "succeeded",
  outputPath: saved.outputPath,
  previewUrl: saved.previewUrl,
  saveMode: saved.saveMode,
  saveFallbackReason: saved.saveFallbackReason,
};
```

- [ ] **Step 4: Add explicit directory state**

```ts
type OutputDirectoryState =
  | { status: "unsupported" }
  | { status: "not-authorized" }
  | { status: "permission-required"; name: string }
  | { status: "ready"; name: string; lastTestedAt: string };
```

设置页不能只根据 `outputDirectory` 字符串显示“已配置”。

- [ ] **Step 5: Add batch warning UI**

批量完成信息增加：

```text
生成成功 5，保存到授权目录 3，回退到浏览器下载 2。
```

每个回退任务可展开查看脱敏后的原因。

- [ ] **Step 6: Add mock E2E for fallback**

模拟目录写入失败，断言：

- 图片生成仍成功。
- 页面显示保存回退。
- 批量摘要统计回退数量。
- manifest 包含 saveMode。

- [ ] **Step 7: Run native acceptance in Chrome or Edge**

在一个受支持的 Chromium 浏览器中执行一次即可，可选择 Chrome 或 Edge，并记录浏览器名称及准确版本；不要求两者分别执行。

验收步骤：

1. 授权普通子目录。
2. 测试文件写入和读回成功。
3. 单图真实生成落入授权目录。
4. 批量两张均落入批次子目录。
5. 刷新页面。
6. 在一次明确的“恢复目录权限”用户操作后恢复历史预览。
7. 确认默认 Downloads 根目录没有出现重复回退文件。

- [ ] **Step 8: Commit**

```powershell
git add src/core/batchTypes.ts src/core/batchRunner.ts src/components/BatchPanel.tsx src/runtime/types.ts src/runtime/webAdapter.ts src/runtime/webAdapter.test.ts tests/e2e/static-html-page.spec.ts src/i18n/translations.ts
git commit -m "fix: report authorized-folder saves and browser fallbacks accurately"
```

### Task 5: Repair Batch State And AI Count Consistency

**Execution status:** completed and reviewed。重试竞态和任务数量一致性由 Task 10 单元测试、mock E2E 与真实 smoke 复核。

- [ ] **Step 1: Write failing retry race tests**

覆盖：

- 重试期间清空和再次重试按钮禁用。
- 双击重试只调用一次供应商。
- 请求结束后不覆盖重试期间的其他任务状态。

- [ ] **Step 2: Introduce task-level retry state**

```ts
const [retryingTaskIds, setRetryingTaskIds] = useState<Set<string>>(new Set());
const hasActiveTaskRetry = retryingTaskIds.size > 0;
```

所有会破坏任务列表的操作在 `isRunning || hasActiveTaskRetry` 时禁用。

- [ ] **Step 3: Use functional state updates**

```ts
const latestTasksRef = useRef(tasks);

useEffect(() => {
  latestTasksRef.current = tasks;
}, [tasks]);

const nextTasks = latestTasksRef.current.map((item) =>
  item.id === task.id ? retried : item,
);
latestTasksRef.current = nextTasks;
setTasks(nextTasks);
await persistManifest("completed", nextTasks, nextStartedAt);
```

manifest 持久化使用最终快照，不使用旧闭包中的 `tasks`。

- [ ] **Step 4: Write failing AI count mismatch tests**

至少覆盖：

```ts
{ recommendedCount: 4, items: [a, b, c] }
{ items: [a, b, c, d], initialCount: 3 }
{ recommendedCount: 25, items: twentyFiveItems }
```

- [ ] **Step 5: Normalize planning result**

规则：

- 自动规划关闭：必须得到用户指定数量，否则提示重试。
- 自动规划开启且 recommendedCount 缺失：使用有效 items.length。
- recommendedCount 与 items.length 不一致：不 slice，显示模型结果不一致并阻止回填。
- 超过 20：显示确认步骤，不静默截断。

- [ ] **Step 6: Verify**

```powershell
npx vitest run src/core/batchPromptSplitter.test.ts src/components/BatchPanel.test.tsx
npm run e2e:static:mock
```

Expected: 重试和计数异常用例均通过。

- [ ] **Step 7: Commit**

```powershell
git add src/core/batchPromptSplitter.ts src/core/batchPromptSplitter.test.ts src/components/BatchPanel.tsx src/components/BatchPanel.test.tsx tests/e2e/static-html-page.spec.ts
git commit -m "fix: make batch retries and ai task counts deterministic"
```

### Task 6: Centralize Error And Secret Handling

**Execution status:** completed and reviewed。错误脱敏、短期凭据策略和构建产物扫描由 Task 10 测试及两层 secret scan 复核。

- [ ] **Step 1: Write failing sanitizer tests**

```ts
expect(sanitizeProviderError(new Error(
  "failed https://provider.example/file?token=secret-value Authorization: Bearer secret"
))).not.toMatch(/secret-value|Bearer secret|provider\.example/);
```

覆盖 JSON 响应、嵌套 URL、query token、Authorization 和超长正文。

- [ ] **Step 2: Implement structured sanitization**

```ts
export type SafeProviderError = {
  category: "auth" | "rate-limit" | "timeout" | "provider" | "network" | "unknown";
  userMessage: string;
  requestId?: string;
};
```

UI 不再直接渲染 `error.message`。

- [ ] **Step 3: Separate API key persistence**

保存普通配置时排除 `apiKey`：

```ts
const { apiKey: _secret, ...persistableConfig } = config;
writeStoredValue(CONFIG_KEY, persistableConfig);
```

默认将 key 放在 sessionStorage；只有用户勾选“记住 API key”才写入单独的 localStorage key。

- [ ] **Step 4: Create one secret scan**

`secret-scan.mjs` 扫描：

- git tracked 文件。
- 待提交 untracked 文本文件。
- dist-static。
- 常见 key/token 格式。
- `.env.e2e.local` 中真实密钥值是否出现在其他文件。

扫描输出只包含路径和规则名。

- [ ] **Step 5: Wire scan into release gates**

```json
{
  "secret:scan": "node scripts/secret-scan.mjs",
  "site:verify": "npm run build:static && npm run site:check && npm run secret:scan"
}
```

Pages 和 Release workflow 均执行 `npm run secret:scan`。

- [ ] **Step 6: Verify**

```powershell
npx vitest run src/core/errorSanitizer.test.ts scripts/secret-scan.test.mjs
npm run secret:scan
```

Expected: 测试假密钥会被识别；真实仓库无命中；命令不打印秘密值。

- [ ] **Step 7: Commit**

```powershell
git add src/core/errorSanitizer.ts src/core/errorSanitizer.test.ts src/core/apiClient.ts src/App.tsx src/runtime/webAdapter.ts scripts/secret-scan.mjs scripts/secret-scan.test.mjs scripts/release-readiness.mjs package.json package-lock.json .github/workflows
git commit -m "security: protect provider errors and local api keys"
```

### Task 7: Complete Blob URL Lifecycle

**Execution status:** completed and reviewed。单图、批量、历史与卸载清理由 Task 10 单元和组件测试复核。

- [ ] **Step 1: Add failing cleanup tests**

对 `URL.revokeObjectURL` 使用 spy，覆盖：

- 新单图替换旧单图。
- 单图成功切换到失败状态。
- 清空批次。
- 修改成功任务提示词。
- 组件卸载。

- [ ] **Step 2: Add one helper**

```ts
export function revokeBlobUrl(url?: string) {
  if (url?.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}
```

- [ ] **Step 3: Apply ownership cleanup**

规则：

- 只有创建或接管 URL 的组件负责 revoke。
- 仍被其他预览状态引用的 URL 不提前回收。
- http、https 和 data URL 不调用 revoke。

- [ ] **Step 4: Verify**

```powershell
npx vitest run src/App.test.tsx src/components/BatchPanel.test.tsx src/runtime/webAdapter.test.ts
```

Expected: 所有 URL 正好回收一次。

- [ ] **Step 5: Commit**

```powershell
git add src/core/blobUrl.ts src/core/blobUrl.test.ts src/App.tsx src/components/BatchPanel.tsx src/App.test.tsx src/components/BatchPanel.test.tsx
git commit -m "fix: release generated image blob urls"
```

### Task 8: Expand Static Page Coverage

**Execution status:** completed and reviewed。自动化覆盖已在 Task 10 重新验证。以下已批准 P2 风险作为非阻断跟进项保留，不标记为已修复：

- async workspace-save ordering。
- quota/write capability optimism。
- slow hydration overwrite。
- refresh E2E persistence synchronization。

- [ ] **Step 1: Add direct file mode test**

通过绝对 `file:///.../dist-static/gpt-image-2-studio-lite.html` 打开 Release 文件，验证：

- 页面可启动。
- localStorage 被拒绝时降级到内存存储，不崩溃。
- 用户仍可填写配置并进入生成页。

- [ ] **Step 2: Add mobile project**

```ts
{
  name: "mobile-chromium",
  use: {
    ...devices["Pixel 7"],
  },
}
```

验证单图、批量、历史、设置 4 个菜单，没有横向溢出，主要按钮可见。

- [ ] **Step 3: Add failure and retry flow**

第一次 mock 返回 500，第二次返回 base64 成功，断言：

- 任务进入 failed。
- 重试按钮可用。
- 重试后变为 succeeded。
- 历史只增加成功图片记录。

- [ ] **Step 4: Add batch image-to-image request tests**

覆盖：

- 全局参考图应用到所有任务。
- 每个子任务独立参考图。
- multipart 中每张图都使用重复 `image` 字段。

- [ ] **Step 5: Add refresh persistence flow**

创建批量草稿、刷新、确认主任务、任务数量、子任务提示词和状态恢复。

- [ ] **Step 6: Verify**

```powershell
npm run e2e:static:mock
npm run e2e:static:file
```

Expected: 桌面和手机项目通过；file 模式通过；失败重试和批量图生图通过。

- [ ] **Step 7: Commit**

```powershell
git add tests/e2e playwright.static.config.ts package.json package-lock.json
git commit -m "test: cover mobile file mode retries and batch references"
```

### Task 9: Align Release Metadata And Documentation

**Execution status:** completed and reviewed。发布检查和元数据校验已在 Task 10 重新验证。MIT 元数据、构建时版本注入和测试环境加载顺序的原始 P2 已解决。以下已批准 P2 风险作为非阻断跟进项保留，不标记为已修复：

- archive lease heartbeat。
- raw-text workflow validation brittleness。
- public v0.1.4 metadata-leak policy decision。
- security headers：CSP、Referrer-Policy、Permissions-Policy 仍属于未来加固。

- [ ] **Step 1: Fix package metadata**

```json
{
  "license": "MIT"
}
```

- [ ] **Step 2: Stop bundling package.json**

在 Vite define 中注入：

```ts
define: {
  __APP_VERSION__: JSON.stringify(packageJson.version),
}
```

`App.tsx` 改用声明：

```ts
declare const __APP_VERSION__: string;
```

- [ ] **Step 3: Make release notes dynamic**

Release workflow 从 package version 或 tag 生成：

```text
docs/release-notes/v<version>.md
```

tag 与 package version 不一致时失败。

- [ ] **Step 4: Mark historical plans**

在旧 E2E 计划和报告顶部注明：

```markdown
> 历史材料。最新审计和执行状态以 2026-07-11 独立审计与修复计划为准。
```

- [ ] **Step 5: Add trust wording**

README 和设置页明确：

- API key 只发送到用户填写的 Base URL。
- 推荐中转站是可选项。
- 官方模式与中转兼容模式的区别。
- 静态网页无法通过手填磁盘路径取得目录权限。

- [ ] **Step 6: Verify**

```powershell
npm run release:check
npm run build:static
npm run site:check
rg -n '"license":"ISC"|vitest run|@tauri-apps/api' dist-static/index.html
```

Expected: release check 通过；构建产物不再包含完整 package.json 元数据。

- [ ] **Step 7: Commit**

```powershell
git add package.json package-lock.json vite.config.ts vite.static.config.ts src/App.tsx .github/workflows/release.yml README.md README.en.md docs
git commit -m "chore: align static release metadata and documentation"
```

### Task 10: Final Verification And Honest Sign-off

- [x] **Step 1: Run all unit and component tests**

```powershell
npm run test:run
```

Expected: 0 failed。

Result: 31 个测试文件、419 个测试全部通过；Vitest 报告 13.69 秒，命令耗时 15.535 秒。

- [x] **Step 2: Run static build and archive checks**

```powershell
npm run build:static
npm run site:check
```

Expected: latest、release HTML 和所有固定归档满足新规则。

Result:

- `npm run build` 通过，47 个模块，4.384 秒。
- `npm run build:static` 通过，47 个模块，4.285 秒。
- `npm run site:check` 通过，0.834 秒。
- `npm run release:check`：1 个测试文件、16 个测试全部通过，1.846 秒。
- manifest 一致，latest 为 `0.1.5`，共 2 个版本。
- `v0.1.5` 源/分发 SHA-256：`50d653fecf24afd86f7fb7c9f082555a987bb1610acabc5aab93e48f74326056`。
- `v0.1.4` 源/分发 SHA-256：`2921acdd0350d487e0659b0a143c7ac3597da36af80da7fd0a4980190cf19a64`。
- latest 源归档、release HTML 和 index HTML 字节一致；`v0.1.5` 内嵌 manifest 将自身标记为 latest 并包含自身。
- 归档验证只读，未重写固定归档。

- [x] **Step 3: Run mock E2E**

```powershell
npm run e2e:static:mock
npm run e2e:static:file
```

Expected: desktop、mobile、file、失败重试、目录回退和批量图生图均通过。

Result:

- `npm run e2e:static:mock`：10 通过、1 个按 project 设计跳过、0 失败；Playwright 报告 22.8 秒，命令耗时 30.164 秒。
- `npm run e2e:static:file`：2 通过、0 失败；Playwright 报告 2.7 秒，命令耗时 12.052 秒。

- [x] **Step 4: Run real provider smoke**

```powershell
$env:E2E_REAL_PROVIDER='1'
npm run e2e:static:real
```

Expected: 文生图、图生图、双任务批量和 AI 规划都等待真实终态并通过。真实配置和响应不写入报告。

Result: 4 通过、0 失败；Playwright 报告 56.8 秒，命令耗时 63.740 秒。文生图等待预览和历史；图生图等待成功响应和预览，应用只在保存并重新加载历史后发布成功预览；双任务批量等待完成状态、两张预览和两条历史；AI 规划等待成功响应和最终四任务 UI。没有记录真实配置、响应内容或服务身份。

- [ ] **Step 5: Complete native directory acceptance**

Status: **pending/manual evidence missing**。本轮没有执行原生 Chrome/Edge 目录验收，不得标记为 verified。

只需在一个受支持的 Chromium 浏览器中完成一次原生验收，可以选择 Chrome 或 Edge；Chrome/Edge 在本计划中表示二选一，不要求分别执行。

必须记录：

- 浏览器及版本。
- 授权目录类型。
- 测试文件真实位置。
- 单图真实位置。
- 批量真实位置。
- 刷新后历史恢复结果。

所选浏览器的验收应提供上述字段。位置必须脱敏，不得包含用户名或完整私人路径。

不得记录用户名、完整私人路径、API key、Base URL、模型名或供应商响应。

- [x] **Step 6: Run final secret scan**

```powershell
npm run secret:scan
```

Expected: 0 findings。

Result: `npm run secret:scan` 0 个报告发现，1.545 秒；`npm run secret:scan:release` 0 个报告发现，1.028 秒。

- [x] **Step 7: Review dirty files**

```powershell
git status --short
git diff --check
git diff --stat
```

Expected: 没有 Playwright trace、video、screenshot、`.env.e2e.local` 或无关平台私有文件进入提交。

Result: `git diff --check` 0 个空白错误；Playwright 报告和测试结果目录已清理；没有 trace、video、screenshot、报告、环境文件或私有测试文件进入暂存区。生成的 `dist-static` 和无关 May 计划未暂存。

- [x] **Step 8: Update audit statuses**

只在证据真实存在后，把审计报告中的项目改为：

- Fixed and unit-tested
- Mock E2E verified
- Real-provider verified
- Native Chrome/Edge: pending/manual evidence missing

不得用单一“已完成”覆盖不同证据层级。

- [x] **Step 9: Commit verification docs**

```powershell
git add docs/static-html-gpt56-independent-audit-2026-07-11.zh-CN.md docs/superpowers/plans/2026-07-11-static-html-audit-remediation.md
git commit -m "docs: record static html audit verification"
```

## Completion Criteria

- [x] 真实图生图 E2E 等待成功响应和预览；成功预览只在保存并重新加载历史后发布，不再用错误文本缺失作为通过条件。
- [x] Pages 部署运行当前构建的 mock 页面 E2E。
- [x] 官方模式不发送 GPT Image 不支持的 response_format。
- [x] 固定版本归档默认不可覆盖，旧版本不再等于 latest。
- [x] 批量任务显示授权目录保存或浏览器回退的真实结果。
- [ ] Chrome/Edge 原生验收已有人工证据，即在 Chrome 或 Edge 任一受支持浏览器中完成真实目录落盘和历史恢复。
- [x] 重试无竞态，AI 任务数量和 items 永远一致或明确拒绝。
- [x] 用户错误不包含服务秘密，API key 默认不长期持久化。
- [x] secret scan 覆盖非特定前缀形式和最终构建产物。
- [x] 单图与批量 Blob URL 生命周期完整。
- [x] desktop、mobile、file 模式及失败重试均有页面测试。
- [x] MIT、package version、tag、归档和 release notes 保持一致。

**Task 10 status:** automated verification complete; native acceptance pending。自动化层级为 Fixed and unit-tested、Mock E2E verified、Real-provider verified；Native Chrome/Edge 仍为 pending/manual evidence missing。

**Remaining blocker:** 缺少一次单浏览器原生验收。可选择 Chrome 或 Edge，需记录浏览器名称及准确版本、授权目录类型、目录测试文件脱敏真实位置、单图脱敏真实位置、批量图片及 manifest 脱敏真实位置、刷新后历史预览恢复结果。
