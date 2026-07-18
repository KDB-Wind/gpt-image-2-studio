# 供应商配置档案 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前单供应商配置升级为可迁移、可切换、按档案隔离 Key 的多供应商配置系统，并为 CORS 图片 URL 失败提供不会重复计费的 base64 操作建议。

**Architecture:** `AppConfig` 保存版本化的供应商档案元数据和当前档案 ID；API Key 由 Web runtime 按档案 ID 分别存入 session/local storage，运行时解析出的活动档案作为现有 API client 的配置输入。设置页管理完整档案，单图和批量页只提供当前档案快速切换。CORS 下载错误使用稳定错误码传播到单图和批量 UI，按钮只切换当前档案，不自动重新调用。

**Tech Stack:** React 19, TypeScript 6, Vite 8, Vitest 4, Playwright 1.61, Web Storage API, Tauri runtime adapter.

---

## File Map

- Create: `src/core/providerProfiles.ts` - 档案类型、默认档案、迁移、活动档案解析和档案操作纯函数。
- Create: `src/core/providerProfiles.test.ts` - 档案迁移、隔离、增删和校验测试。
- Modify: `src/core/config.ts` - 将 provider profile schema 接入 `AppConfig`，保留通用设置和旧配置兼容入口。
- Modify: `src/core/config.test.ts` - 验证新版配置合并与旧版兼容。
- Modify: `src/runtime/types.ts` - 明确运行时接收活动档案和保存结果中的非敏感来源信息。
- Modify: `src/runtime/webAdapter.ts` - 按档案 ID 隔离 API Key 的 local/session 存储与迁移。
- Modify: `src/runtime/webAdapter.test.ts` - 验证 Key 不串档、不写入公开配置。
- Modify: `src/runtime/tauriAdapter.ts` and `src/runtime/tauriAdapter.test.ts` - 适配桌面配置结构，不改变桌面文件保存行为。
- Modify: `src/core/apiClient.ts` and `src/core/apiClient.test.ts` - 接收解析后的活动档案并保持两种响应模式语义。
- Create: `src/core/imageDownloadError.ts` and `src/core/imageDownloadError.test.ts` - 跨 runtime、batch 和 UI 传播不含敏感 URL 的稳定图片下载错误码。
- Modify: `src/core/history.ts` and `src/core/batchTypes.ts` - 增加非敏感档案来源快照与 batch error suggestion 字段。
- Modify: `src/core/batchRunner.ts` and `src/core/batchRunner.test.ts` - 识别 CORS URL 失败为可暂停的成本风险。
- Modify: `src/App.tsx`, `src/App.test.tsx`, `src/App.smoke.test.tsx`, `src/App.desktop.test.tsx` - 档案状态、设置管理、快速切换和错误操作入口。
- Modify: `src/components/BatchPanel.tsx` and `src/components/BatchPanel.test.tsx` - 批量页快速选择器和执行锁定状态。
- Modify: `src/i18n/translations.ts` and `src/i18n/translations.test.ts` - 中英文档案、切换和 CORS 操作文案。
- Modify: `src/styles.css` - 档案管理区、紧凑快速选择器和错误操作布局。
- Modify: `tests/e2e/static-html-page.spec.ts` - 静态 HTML 档案迁移、切换、请求隔离和移动端回归。
- Modify: `docs/user-guide-static-html.zh-CN.md`, `docs/user-guide-static-html.en-US.md` - 用户配置多个供应商档案和 base64 排障说明。

不修改 `static-versions/versions/v0.1.7/index.html`；实现完成后由独立发布任务决定是否生成 `v0.1.8`。

### Task 1: Add Profile Domain Model And Migration

**Files:** `src/core/providerProfiles.ts`, `src/core/providerProfiles.test.ts`, `src/core/config.ts`, `src/core/config.test.ts`

- [ ] **Step 1: Write failing domain tests**

覆盖以下行为：

```ts
it("migrates one legacy provider into the default profile", () => {
  const migrated = migrateProviderProfiles({
    uiLanguage: "en-US",
    baseUrl: "https://legacy.example/v1",
    apiKey: "legacy-key",
    textModel: "legacy-text",
    imageModel: "legacy-image",
    imageResponseMode: "force-base64",
    rememberApiKey: true,
  });

  expect(migrated.activeProviderProfileId).toBe("provider-default");
  expect(migrated.providerProfiles).toHaveLength(1);
  expect(migrated.providerProfiles[0]).toMatchObject({
    id: "provider-default",
    name: "Default provider",
    baseUrl: "https://legacy.example/v1",
    textModel: "legacy-text",
    imageModel: "legacy-image",
    imageResponseMode: "force-base64",
    rememberApiKey: true,
    apiKey: "legacy-key",
  });
});

it("does not migrate again when the new schema already exists", () => {
  const input = createProviderConfigWithTwoProfiles();
  expect(migrateProviderProfiles(input)).toEqual(input);
});

it("does not delete the final profile and resolves a valid active profile", () => {
  const single = createProviderConfigWithOneProfile();
  expect(removeProviderProfile(single, single.activeProviderProfileId).providerProfiles).toHaveLength(1);
  expect(resolveActiveProviderProfile(single).id).toBe(single.activeProviderProfileId);
});

it("uses the localized default name and enforces the 20-profile limit", () => {
  expect(migrateProviderProfiles({ uiLanguage: "zh-CN" }).providerProfiles[0].name).toBe("默认供应商");
  expect(addProviderProfile(createProviderConfigWithTwentyProfiles()).providerProfiles).toHaveLength(20);
});
```

Define the three fixture helpers in `providerProfiles.test.ts`: one returns a valid single-profile config, one returns two distinct valid profiles, and one returns exactly 20 valid profiles. They must use fake keys such as `test-key-a`, never production-shaped credentials.

- [ ] **Step 2: Run the focused tests and verify RED**

Run `npx vitest run src/core/providerProfiles.test.ts src/core/config.test.ts`.
Expected: FAIL because the profile types and migration helpers do not exist.

- [ ] **Step 3: Implement the profile domain**

Define a runtime `ProviderProfile` with `id`, `name`, `baseUrl`, `apiKey`, `textModel`, `imageModel`, `imageResponseMode`, and `rememberApiKey`; define a persisted profile type that excludes `apiKey`. Implement:

```ts
export const MAX_PROVIDER_PROFILES = 20;
export const DEFAULT_PROVIDER_PROFILE_ID = "provider-default";
export function migrateProviderProfiles(value: Partial<AppConfig>): ProviderConfig;
export function resolveActiveProviderProfile(config: ProviderConfig): ProviderProfile;
export function addProviderProfile(config: ProviderConfig): ProviderConfig;
export function upsertProviderProfile(config: ProviderConfig, profile: ProviderProfile): ProviderConfig;
export function removeProviderProfile(config: ProviderConfig, profileId: string): ProviderConfig;
```

Migration must be idempotent, preserve legacy fields, create at least one profile, normalize Base URL, and reject empty names. Do not place an API key in persisted profile metadata.

- [ ] **Step 4: Integrate schema normalization**

Add `providerSchemaVersion`, `activeProviderProfileId`, and `providerProfiles` to `AppConfig`. Make `mergeConfig()` call the migration once, while keeping legacy top-level fields accepted for old tests and old stored values. Make `validateConfig()` validate the resolved active profile.

- [ ] **Step 5: Run focused tests and commit**

Run `npx vitest run src/core/providerProfiles.test.ts src/core/config.test.ts` and `npx tsc --noEmit`.
Expected: all focused tests pass. Commit:

```powershell
git add src/core/providerProfiles.ts src/core/providerProfiles.test.ts src/core/config.ts src/core/config.test.ts
git commit -m "feat: add provider profile domain model"
```

### Task 2: Isolate API Keys In Runtime Storage

**Files:** `src/runtime/webAdapter.ts`, `src/runtime/webAdapter.test.ts`, `src/runtime/types.ts`, `src/runtime/tauriAdapter.ts`, `src/runtime/tauriAdapter.test.ts`

- [ ] **Step 1: Write failing storage tests**

Assert that loading two profiles restores the correct session/local key by profile ID, disabling remember removes the persistent key, deleting a profile removes both key entries, and serialized config contains no `apiKey` values.

- [ ] **Step 2: Run storage tests and verify RED**

Run `npx vitest run src/runtime/webAdapter.test.ts src/runtime/tauriAdapter.test.ts`.
Expected: FAIL on profile-specific key isolation.

- [ ] **Step 3: Implement Web storage namespacing**

Use keys equivalent to:

```ts
const PROFILE_KEYS_LOCAL = "chat-to-image.provider-keys.local.v1";
const PROFILE_KEYS_SESSION = "chat-to-image.provider-keys.session.v1";
```

Store maps keyed by profile ID. `loadConfig()` hydrates every runtime profile with only its own key. `saveConfig()` persists only profile metadata, synchronizes every non-empty runtime profile key into session or local storage according to that profile's `rememberApiKey`, removes the key from the other storage tier, and prunes IDs that no longer exist. Migrate the legacy single `apiKey` storage into the migrated default profile exactly once.

- [ ] **Step 4: Adapt desktop storage**

Keep Tauri’s local configuration behavior compatible with the new schema. Strip no more data than the existing desktop adapter requires, and ensure profile switching returns a complete active profile to the caller.

- [ ] **Step 5: Verify and commit**

Run `npx vitest run src/runtime/webAdapter.test.ts src/runtime/tauriAdapter.test.ts` and `npx tsc --noEmit`.
Commit:

```powershell
git add src/runtime/types.ts src/runtime/webAdapter.ts src/runtime/webAdapter.test.ts src/runtime/tauriAdapter.ts src/runtime/tauriAdapter.test.ts
git commit -m "feat: isolate provider api keys by profile"
```

### Task 3: Resolve Active Profile At The API Boundary

**Files:** `src/core/apiClient.ts`, `src/core/apiClient.test.ts`, `src/core/history.ts`, `src/core/history.test.ts`, `src/core/batchTypes.ts`, `src/core/batchTypes.test.ts`

- [ ] **Step 1: Write failing request and metadata tests**

Use two profiles with distinct URL/model/response mode and assert generation/edit/text requests use the resolved profile. Assert image and batch records contain profile ID/name/model/mode but never API Key. Assert old records without a snapshot remain readable and receive the localized legacy-config label at display time.

- [ ] **Step 2: Run focused tests and verify RED**

Run `npx vitest run src/core/apiClient.test.ts src/core/history.test.ts src/core/batchTypes.test.ts`.
Expected: FAIL because request inputs and record types do not expose profile snapshots.

- [ ] **Step 3: Implement resolved profile inputs**

Add a single helper at the API boundary:

```ts
export type ProviderRequestConfig = {
  baseUrl: string;
  apiKey: string;
  textModel: string;
  imageModel: string;
  imageResponseMode: ImageResponseMode;
};
```

Make `generateImages`, `testTextModel`, `testImageModel`, `testImageEditModel`, and `optimizePrompt` consume the active profile snapshot. Preserve `official` omission and `force-base64` request behavior. Add a non-sensitive `ProviderProfileSnapshot` to save/history inputs.

- [ ] **Step 4: Verify request isolation and commit**

Run the focused tests and `npx tsc --noEmit`.
Commit:

```powershell
git add src/core/apiClient.ts src/core/apiClient.test.ts src/core/history.ts src/core/history.test.ts src/core/batchTypes.ts src/core/batchTypes.test.ts
git commit -m "feat: resolve api requests from active profile"
```

### Task 4: Add Structured CORS Failure Signals

**Files:** `src/core/imageDownloadError.ts`, `src/core/imageDownloadError.test.ts`, `src/runtime/webAdapter.ts`, `src/runtime/webAdapter.test.ts`, `src/core/batchRunner.ts`, `src/core/batchRunner.test.ts`

- [ ] **Step 1: Write failing error tests**

Test that a provider URL download failure creates a stable `image-url-cors` signal, includes no full URL/token, classifies as `cost_risk`, and pauses remaining batch tasks. Test that a `force-base64` URL response produces a different “provider ignored base64” signal without the switch recommendation.

- [ ] **Step 2: Run tests and verify RED**

Run `npx vitest run src/runtime/webAdapter.test.ts src/core/batchRunner.test.ts src/core/errorClassifier.test.ts`.
Expected: FAIL because the stable signal and batch classification do not exist.

- [ ] **Step 3: Implement typed failure metadata**

Define a shared error type with stable codes:

```ts
type ImageDownloadFailureCode = "image-url-cors" | "image-url-base64-ignored";
```

Export `ImageDownloadError` and `isImageDownloadError()` from `src/core/imageDownloadError.ts`. Attach the code without storing provider URLs. Map the code to `cost_risk` in batch execution. Add a `suggestedAction` field to failed batch tasks and manifests with value `force-base64` only for `image-url-cors`.

- [ ] **Step 4: Verify and commit**

Run the focused tests and `npx tsc --noEmit`.
Commit:

```powershell
git add src/core/imageDownloadError.ts src/core/imageDownloadError.test.ts src/runtime/webAdapter.ts src/runtime/webAdapter.test.ts src/core/batchRunner.ts src/core/batchRunner.test.ts src/core/batchTypes.ts
git commit -m "fix: classify image url cors failures"
```

### Task 5: Build Settings Profile Management

**Files:** `src/App.tsx`, `src/App.test.tsx`, `src/App.smoke.test.tsx`, `src/i18n/translations.ts`, `src/i18n/translations.test.ts`, `src/styles.css`

- [ ] **Step 1: Write failing UI tests**

Cover: migrated default profile is visible; create profile adds a unique profile; editing name/URL/model/mode is isolated; deleting one of two profiles selects the remaining profile; the final profile cannot be deleted; Chinese and English labels exist.

- [ ] **Step 2: Run UI tests and verify RED**

Run `npx vitest run src/App.test.tsx src/App.smoke.test.tsx src/i18n/translations.test.ts`.
Expected: FAIL because the profile management controls do not exist.

- [ ] **Step 3: Implement state and actions**

Add App helpers for `activeProviderProfile`, `updateProviderProfile`, `createProviderProfile`, `deleteProviderProfile`, and `persistActiveProviderProfileId`. Keep general image settings outside profile objects. Disable delete when only one profile remains. On profile changes, retain current prompt, batch draft, references, and history state.

- [ ] **Step 4: Render localized settings UI**

Add compact profile selector, create/delete controls, editable profile fields, and response mode hint. Use the existing settings save action for profile fields; persist the active profile ID immediately when switching. Do not render an API Key value outside the password input.

- [ ] **Step 5: Verify and commit**

Run focused UI tests and `npx tsc --noEmit`.
Commit:

```powershell
git add src/App.tsx src/App.test.tsx src/App.smoke.test.tsx src/i18n/translations.ts src/i18n/translations.test.ts src/styles.css
git commit -m "feat: add provider profile settings"
```

### Task 6: Add Single And Batch Quick Switching

**Files:** `src/App.tsx`, `src/components/BatchPanel.tsx`, `src/components/BatchPanel.test.tsx`, `src/App.test.tsx`, `src/App.desktop.test.tsx`, `src/styles.css`

- [ ] **Step 1: Write failing quick-switch tests**

Assert that the single and batch views show the active profile name and response mode, switching changes the next request target, prompts/references remain unchanged, and the selector is disabled while a batch is running.

- [ ] **Step 2: Run tests and verify RED**

Run `npx vitest run src/components/BatchPanel.test.tsx src/App.test.tsx src/App.desktop.test.tsx`.
Expected: FAIL because generation views have no provider selector or execution lock.

- [ ] **Step 3: Implement the shared selector**

Render one reusable selector from the profiles list in both views. Resolve the selected profile immediately before every text, image, edit, batch, and AI split call so a stale closure cannot send the previous profile. Lock it from `batchStart` until the batch reaches a terminal state.

- [ ] **Step 4: Verify and commit**

Run focused tests and `npx tsc --noEmit`.
Commit:

```powershell
git add src/App.tsx src/components/BatchPanel.tsx src/components/BatchPanel.test.tsx src/App.test.tsx src/App.desktop.test.tsx src/styles.css
git commit -m "feat: add generation provider quick switch"
```

### Task 7: Add CORS Action UI And Documentation

**Files:** `src/App.tsx`, `src/components/BatchPanel.tsx`, `src/App.test.tsx`, `src/App.smoke.test.tsx`, `src/i18n/translations.ts`, `src/i18n/translations.test.ts`, `docs/user-guide-static-html.zh-CN.md`, `docs/user-guide-static-html.en-US.md`

- [ ] **Step 1: Write failing action tests**

Test single-image CORS failure renders the exact localized explanation and a “switch to force base64” action. Clicking it changes and saves only the current profile and does not increase provider call count. Test a batch CORS failure pauses remaining tasks and exposes the same action; when already in force-base64 mode, the action is absent.

- [ ] **Step 2: Run tests and verify RED**

Run `npx vitest run src/App.test.tsx src/App.smoke.test.tsx src/core/batchRunner.test.ts`.
Expected: FAIL because no action state or localized action exists.

- [ ] **Step 3: Implement single-image action**

Store a typed `imageResponseSuggestion` state instead of parsing user-facing text. Render a button that calls `setCurrentProfileResponseMode("force-base64")`, persists the profile, clears only the stale error suggestion, and leaves generation idle. The user must invoke retry manually.

- [ ] **Step 4: Implement batch pause/action**

When the runner returns a failed task with `suggestedAction: "force-base64"`, pause the batch and render one batch-level action. Updating the active profile must not alter already completed task records or rerun any task automatically.

- [ ] **Step 5: Update bilingual documentation**

Document profile creation, per-profile remember-Key behavior, quick switching, and the CORS/base64 decision tree. Do not mention a specific test supplier or embed real endpoints/keys.

- [ ] **Step 6: Verify and commit**

Run focused tests and `npx tsc --noEmit`.
Commit:

```powershell
git add src/App.tsx src/components/BatchPanel.tsx src/App.test.tsx src/App.smoke.test.tsx src/i18n/translations.ts src/i18n/translations.test.ts docs/user-guide-static-html.zh-CN.md docs/user-guide-static-html.en-US.md
git commit -m "feat: guide base64 recovery for cors image urls"
```

### Task 8: Static E2E, Security, And Full Verification

**Files:** `tests/e2e/static-html-page.spec.ts`, `scripts/secret-scan.mjs` only if a new fixture is required, `docs/superpowers/specs/2026-07-18-provider-profiles-design.md`

- [ ] **Step 1: Add static page E2E coverage**

Use mocked providers and two synthetic profiles to verify migration, profile switching, request isolation, active-profile persistence, CORS action without duplicate request, batch pause, and Pixel 7 no-overflow.

- [ ] **Step 2: Run the new E2E cases**

Run `npm run build:static` followed by `npx playwright test tests/e2e/static-html-page.spec.ts --config=playwright.static.config.ts --grep "provider|cors|profile"`.
Expected: all new provider profile and CORS cases pass against the integrated implementation from Tasks 1-7.

- [ ] **Step 3: Run complete verification**

Run:

```powershell
npm run test:run
npm run build
npm run build:static
npm run e2e:static:mock
npm run secret:scan
npx tsc --noEmit
git diff --check
```

Expected: all tests, builds, E2E checks, secret scan, TypeScript check, and whitespace validation pass. Do not stage generated `dist-static` output or modify `static-versions/versions/v0.1.7/index.html`.

- [ ] **Step 4: Verify public artifacts**

Scan tracked and generated public artifacts for API-key-like strings, signed URL query parameters, full provider responses, and test secrets. Confirm `.env.e2e.local`, `test-results/`, and `playwright-report/` are ignored and not staged.

- [ ] **Step 5: Update Spec evidence and commit**

Append exact test results, migration evidence, and public artifact scan result to the Spec. Commit:

```powershell
git add tests/e2e/static-html-page.spec.ts docs/superpowers/specs/2026-07-18-provider-profiles-design.md
git commit -m "test: verify provider profile switching"
```

## Final Acceptance

- Two local profiles can be configured and switched from both Single image and Batch.
- A legacy config loads without re-entry and becomes the default profile.
- Profile A never sends Profile B’s URL, model, response mode, or API Key.
- CORS URL failures offer a safe base64 switch and never auto-retry.
- Full unit, component, static E2E, build, TypeScript, and secret checks pass.
- No public static artifact or immutable `v0.1.7` archive is changed.
- Release and GitHub Pages deployment remain separate approval steps.
