# 静态 HTML Playwright E2E 测试报告

> **历史材料：** 本文已被 2026-07-11 独立审计与修复取代，仅保留用于追溯，不代表当前验证结论。

日期：2026-07-05

测试对象：GitHub Pages / 单文件静态 HTML 版本，本地预览地址为 `http://127.0.0.1:4174/`。

工作区：`<REPO_ROOT>`

脱敏证据文件：`C:\Users\<USER>\AppData\Local\Temp\gpt-image-2-studio-e2e\sanitized-e2e-results-3.json`

## 1. 测试结论

本轮测试确认：页面基础状态保存、Mock 单图保存、Mock 批量失败重试、AI 批量任务规划均可用；真实模型调用链路存在两个 P1 级兼容性问题，导致真实文生图和图生图在当前供应商下不可完整闭环。

主要问题：

- `P1` 文生图接口返回 HTTP 200，但页面保存失败。根因是请求没有要求供应商返回 `b64_json`，供应商返回图片 URL 后，浏览器侧再 `fetch(image.url)` 被 CORS 拦截。
- `P1` 图生图接口返回 HTTP 400。根因是当前表单字段名为 `image[]`，该供应商期望字段名为 `image`。
- `P1` 保存目录授权无法用普通 Playwright 全自动确认，因为 `showDirectoryPicker()` 是浏览器原生目录选择 UI，需要人工或更特殊的浏览器权限注入方式验证。当前自动化只能证明未授权时会回退到浏览器默认下载。
- `P2` 真实调用失败时，页面只显示 `Failed to fetch`，没有告诉用户“供应商已成功生成图片，但浏览器无法跨域下载供应商 URL”，排障成本较高。

## 2. 测试范围

已覆盖：

- 首次配置保存与刷新恢复。
- Mock 文生图下载与历史记录。
- Mock 批量失败、重试与历史记录。
- 真实文字模型批量规划。
- 真实文生图调用。
- 真实图生图调用。
- 真实自定义多条提示词批量调用。
- 密钥与临时证据脱敏检查。

未完全自动化覆盖：

- 真实 File System Access API 目录授权后的文件落点验证。
- 浏览器原生目录选择弹窗。
- 长时间高并发压测。
- 大量 4K 图片成本型测试。

## 3. 安全处理与密钥检查

本轮测试遵循以下约束：

- 真实 `API key`、`Base URL`、文字模型名、生图模型名只从 `.env.e2e.local` 读取。
- `.env.e2e.local` 位于 worktree 根目录，并已被 `.gitignore` 忽略。
- 报告、计划、测试证据不写入真实密钥。
- E2E 证据文件为脱敏文件，敏感字段已替换。

已执行的安全检查：

- 仓库扫描未发现真实密钥；仅命中文档中的正则示例。
- 临时证据目录扫描结果为 `hitCount: 0`。
- 截图与日志引用均使用脱敏模型名或脱敏占位。

后续修复完成后仍需再次执行：

```powershell
rg -n "sk-[A-Za-z0-9_-]{24,}|1ts[A-Za-z0-9_-]{20,}|E2E_API_KEY|YOUR_REAL_KEY" . --glob "!node_modules/**" --glob "!dist/**"
```

注意：上面的命令用于发现误提交风险；如果只命中文档中的占位词或环境变量名，不代表泄露。

## 4. 测试证据摘要

### 4.1 通过项：配置保存与刷新恢复

用例：`config-save-refresh-realistic-fake`

结果：通过。

证据：

- 配置保存后刷新页面，`Base URL`、隐藏的 `API key`、文字模型、生图模型可恢复。
- 控制台只有浏览器对 password input 的提示，不影响功能。

定位：

- `src/runtime/webAdapter.ts` 的 localStorage 读写 fallback 当前可用。

### 4.2 通过项：Mock 单图保存与历史记录

用例：`mock-single-save-download-history`

结果：通过。

证据：

- Mock `/v1/images/generations` 返回 HTTP 200。
- 页面触发下载：`22-44-28_a-tiny-e2e-test-image.png`。
- 历史记录新增 1 条。
- 历史记录可见。

定位：

- 当图片数据是可直接解码的 base64 或 mock 可控数据时，`saveImage()` 与历史记录链路可工作。

### 4.3 通过项：Mock 批量失败与重试

用例：`mock-batch-failure-retry`

结果：通过。

证据：

- 三次 mock 调用状态分别为 500、200、200。
- 首轮存在失败，重试后历史记录数为 2。

定位：

- 批量任务状态机、失败任务重试和成功写历史记录的基础逻辑可用。

### 4.4 通过项：AI 批量规划自动调整数量

用例：`real-ai-planning-adjusts-count`

结果：通过。

证据：

- 文字模型 `/v1/responses` 返回 HTTP 200。
- 用户初始任务数量为 3。
- AI 判断应拆成 4 个任务，页面自动调整为 4。
- 子任务分别对应 France、Japan、Belgium、Korea。

定位：

- “同一提示词生成多张”内部的 AI 规划能力已能调用真实文字模型。
- 该能力不依赖本地固定词表，符合之前提出的通用拆分方向。

## 5. 缺陷清单

### P1-001：真实文生图 HTTP 200 后仍失败

模块：单图 / 批量 / 图片保存

复现用例：

- `real-single-text-to-image`
- `real-custom-batch-two-images`

实际结果：

- `/v1/images/generations` 返回 HTTP 200。
- 页面等待下载超时。
- UI 显示 `Failed to fetch`。
- 单图历史记录未新增。
- 批量用例中，两个子任务均失败，成功 0，失败 2。

控制台证据：

- 浏览器阻止从供应商图片 URL 拉取图片。
- 错误类型是 CORS：供应商图片 URL 没有允许 `http://127.0.0.1:4174` 跨域读取。

根因定位：

- `src/core/apiClient.ts` 的 `buildImageGenerationRequest()` 当前请求体包含：

```json
{
  "model": "...",
  "prompt": "...",
  "size": "1024x1024",
  "quality": "...",
  "n": 1,
  "output_format": "png"
}
```

- 请求体缺少 `response_format: "b64_json"`。
- `src/core/apiClient.ts` 的 `parseImageGenerationResponse()` 已支持解析 `b64_json`。
- `src/runtime/webAdapter.ts` 的 `imageToBlob()` 在没有 base64 时会执行 `fetch(input.image.url)`。
- 供应商返回的是临时图片 URL，浏览器端跨域读取失败。

补充验证：

- 直接 Node probe 证明：加入 `response_format: "b64_json"` 后，供应商返回 HTTP 200，且 `data[0]` 包含 `b64_json`。

期望结果：

- 静态网页应优先请求 `b64_json`。
- 页面拿到 base64 后在本地解码保存，不再依赖跨域读取供应商图片 URL。

影响：

- 真实文生图主流程不可用。
- 真实批量文生图不可用。
- 供应商已完成生成但页面保存失败，可能造成用户已付费但无结果。

### P1-002：真实图生图字段名不兼容

模块：单图图生图 / 批量图生图

复现用例：`real-single-image-edit`

实际结果：

- `/v1/images/edits` 返回 HTTP 400。
- 返回内容包含：`image file is required`。
- UI 显示供应商错误。

根因定位：

- `src/core/apiClient.ts` 的 `buildImageEditRequest()` 当前使用：

```ts
payload.append("image[]", image, image.name);
```

- 该供应商期望字段名为 `image`。
- 直接 probe 证明：
  - `image[]` 返回 HTTP 400，错误类型为 `image_required`。
  - `image` 字段会被供应商识别。
  - 使用 128x128 PNG 且字段为 `image` 时，供应商返回 HTTP 200，且 `data[0]` 包含 `b64_json`。

期望结果：

- 默认使用 OpenAI 兼容生态更常见、该供应商可识别的 `image` 字段。
- 多张参考图时重复 append 同名 `image` 字段，而不是 `image[]`。
- 图生图也应请求 `response_format: "b64_json"`，避免后续保存时再次遇到 CORS 问题。

影响：

- 当前真实图生图主流程不可用。
- 批量图生图会继承同一问题。

### P1-003：保存目录授权无法在当前自动化中闭环证明

模块：设置 / 保存目录 / 历史预览

实际结果：

- Playwright 普通脚本无法像用户一样操作 `showDirectoryPicker()` 原生目录选择 UI。
- 自动化只能证明：未授权目录时，页面会触发浏览器下载 fallback。

定位：

- `src/runtime/webAdapter.ts` 已有 `chooseOutputDirectory()`、`persistDirectoryHandle()`、`resolveDirectoryHandle()`、`testOutputDirectory()`。
- 但真实浏览器授权依赖用户手动选择目录，且不同浏览器对 Downloads 根目录授权限制不同。

期望结果：

- 测试上拆分为两类：
  - 自动化测试：mock File System Access API，验证授权目录优先保存、fallback 原因可见。
  - 人工验收：用 Chrome/Edge 选择 `C:\Users\<User>\Downloads\gpt-image-2-studio` 子目录，执行测试保存目录、真实生图、刷新后历史预览恢复。

影响：

- 不能仅凭本轮 Playwright 证明“授权目录真实落点正常”。
- 这是上线前必须人工复核的核心项，但不一定是代码缺陷。

### P2-001：真实图片 URL CORS 失败时错误信息不可诊断

模块：错误提示 / 单图 / 批量

实际结果：

- 用户只看到 `Failed to fetch`。
- 实际上供应商 `/images/generations` 已返回 HTTP 200，并产生了图片 URL。
- 页面失败发生在浏览器下载供应商 URL 阶段。

根因定位：

- `src/runtime/webAdapter.ts` 的 `imageToBlob()` 对 `fetch(input.image.url)` 的网络错误没有转换成业务可读消息。

期望结果：

- 如果 `ParsedImage` 只有 URL，没有 base64，且浏览器 fetch 失败，应提示：
  - 模型供应商已返回图片 URL。
  - 当前浏览器无法跨域下载该 URL。
  - 建议供应商开启 base64 返回，或工具请求 `response_format=b64_json`。

影响：

- 用户会误以为模型生成失败，实际可能已经产生费用。
- 开发定位和供应商沟通成本增加。

### P2-002：真实批量用例状态语义容易误导

模块：批量结果 / 历史记录

实际结果：

- 真实批量中两次 `/images/generations` 均 HTTP 200。
- UI 显示成功 0、失败 2。
- 错误为 `Failed to fetch`。

定位：

- 从用户侧看是失败；从成本侧看，供应商调用已经成功完成。
- 这类错误应明确归类为“结果保存失败 / 图片下载失败”，而不是“模型未生成”。

期望结果：

- 批量任务卡片保留供应商调用成功但保存失败的区别。
- 最低限度先优化错误文案，避免用户误判。

影响：

- 用户可能重复重试，造成额外成本。

## 6. 现有代码定位

需要重点查看：

- `src/core/apiClient.ts`
  - `buildImageGenerationRequest()`
  - `buildImageEditRequest()`
  - `parseImageGenerationResponse()`
  - `generateImages()`
- `src/core/apiClient.test.ts`
  - 当前测试仍断言旧请求体，不包含 `response_format`。
  - 当前测试仍断言图片字段为 `image[]`。
- `src/runtime/webAdapter.ts`
  - `imageToBlob()`
  - `saveImage()`
  - `saveBatchImage()`
  - `chooseOutputDirectory()`
  - `testOutputDirectory()`
- `src/runtime/webAdapter.test.ts`
  - 可补充授权目录和 URL fetch 失败错误转换测试。
- `src/i18n/translations.ts`
  - 错误说明、保存目录人工验收提示需要中英文同步。

## 7. 建议修复方向

优先修复：

- 所有图片生成请求默认加入 `response_format: "b64_json"`。
- 图生图 multipart 字段改为重复 `image` 字段。
- 图生图请求也加入 `response_format: "b64_json"`。
- 对只有 URL 且浏览器 fetch 失败的情况给出明确错误提示。
- 增加自动化测试覆盖请求体、multipart 字段、URL CORS 类错误。

暂不建议本轮做：

- 新增复杂供应商配置矩阵。
- 引入代理服务帮静态页面下载供应商 URL。
- 改造保存目录为强制保存，因为静态网页受浏览器安全模型限制，无法强制写入用户任意本地路径。

## 8. 下一阶段验收标准

修复后应满足：

- `buildImageGenerationRequest()` 测试断言包含 `response_format: "b64_json"`。
- `buildImageEditRequest()` 测试断言图片字段为 `image`，而不是 `image[]`。
- 真实文生图至少 1 次成功，生成结果可预览、可保存、可进历史。
- 真实自定义多条提示词批量至少 2 张成功。
- 若供应商返回 URL 且浏览器无法下载，页面错误信息能说明 CORS / URL 下载问题。
- 保存目录授权仍需保留人工验收步骤，并在报告中明确记录结果。
- 修复后再次执行密钥扫描，确认无真实密钥进入仓库。

## 2026-07-12 SPEC Review Closure

Status: automated branch gates passed. Native File System Access manual acceptance remains pending, and the aborted Computer Use attempt is not release evidence. No full/native E2E claim is made.

- Frontend/unit: 33 files, 479 tests passed.
- Builds: normal 46 modules; static 42 modules.
- Emitted-artifact isolation: normal dist retains the Tauri adapter and bridge markers; current static HTML/assets exclude them. Immutable historical copies are governed by the raw archive gate.
- Static mock E2E: 10 passed, 1 intentionally skipped by project selection.
- Static file-mode E2E: 2 passed.
- Real-service static E2E: 4 passed after unit/mock gates; no service configuration, identity, signed URL, or response body is recorded.
- Rust: 28 tests passed; cargo check passed.
- Release readiness: 22 readiness tests passed. Clean-HEAD reproducibility, Pages readiness, both secret scans, TypeScript, archive second-attempt rejection, and strict parity passed with explicit trusted base 5c8a3481680496f21628464eb67901886ee0c1e9 and with the default base selection.

Raw Git archive evidence:

- `v0.1.4`: blob 6e35c4fd1e1a02f10c1a2df02032ceb9593a793d; SHA-256 1923F7169B032F5FD7105C54E58B1FC10CE01D6E253B70E06661E46B3A84AC2D.
- `v0.1.5`: blob dc342cf3cf8e04a5e1b02d2d70f4de9f1dc09ac7; SHA-256 72CB38132E9B25F74D960B15D49BC9B105F07E75F254269463889EB4AE64FE22.
- `v0.1.6`: SHA-256 63C131116175AC1ACD527BBBAB34BE72BE5A590A70BDA29D5C01254A7DAD6CAE for the source archive and current generated release HTML.

Correction: earlier Windows checkout-transformed hash claims were not canonical. Historical evidence now uses raw Git blob bytes only. No carriage-return reconstruction or byte normalization is permitted, and a historical archive change still fails even when its digest metadata is changed with it.
