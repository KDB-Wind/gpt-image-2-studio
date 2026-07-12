# 静态 HTML 全流程测试定位报告

> **历史材料：** 本文已被 2026-07-11 独立审计与修复取代，仅保留用于追溯，不代表当前验证结论。

日期：2026-07-06

工作区：`<REPO_ROOT>`

测试对象：GitHub Pages / 单文件静态 HTML 版本，核心目标是确认新用户能否完成配置、单图生成、批量生成、AI 拆分提示词、图生图、历史回看与保存目录授权。

## 1. 总体结论

本轮测试确认：页面基础配置保存、Mock 单图保存、Mock 批量失败重试、AI 批量任务规划均可用。真实供应商链路曾暴露两个 P1 级兼容性问题和两个 P2 级可诊断性问题。

当前代码已在本地修复主要 P1/P2 请求兼容问题：

- 文生图请求已补 `response_format: "b64_json"`，避免静态网页依赖跨域读取供应商临时图片 URL。
- 图生图 multipart 字段已从 `image[]` 改为重复 `image` 字段，并补 `response_format: "b64_json"`。
- 浏览器下载供应商图片 URL 失败时，错误信息已从泛化的 `Failed to fetch` 改为可诊断信息，明确提示 CORS / URL 下载 / `b64_json` 方向。

仍需补齐的验证：

- 真实供应商 smoke 复测记录需要落文档，尤其是文生图、两条批量、图生图、AI 任务规划。
- 保存目录真实落点无法仅靠普通 Playwright 全自动证明，仍需要 Chrome/Edge 人工复测。

## 2. 测试范围

已覆盖：

- 首次配置保存与刷新恢复。
- Mock 文生图下载与历史记录。
- Mock 批量失败、重试与历史记录。
- 真实文字模型批量规划。
- 真实文生图调用定位。
- 真实图生图调用定位。
- 真实自定义多条提示词批量调用定位。
- 密钥与临时证据脱敏检查。

未完全自动化覆盖：

- 真实 File System Access API 目录授权后的文件落点验证。
- 浏览器原生目录选择弹窗。
- 长时间高并发压测。
- 大量 4K 图片成本型测试。

## 3. P1 问题

### P1-001：真实文生图 HTTP 200 后页面仍失败

模块：单图 / 批量 / 图片保存

复现用例：

- `real-single-text-to-image`
- `real-custom-batch-two-images`

实际现象：

- `/images/generations` 返回 HTTP 200。
- 页面随后保存失败，UI 只显示 `Failed to fetch`。
- 单图历史记录未新增。
- 批量中两个子任务均失败，成功 0，失败 2。

测试证据：

- 浏览器控制台显示从供应商图片 URL 拉取图片失败。
- 失败点不在模型生成接口，而在浏览器执行 `fetch(image.url)` 下载图片阶段。
- 供应商图片 URL 没有允许本地预览源跨域读取。

根因定位：

- `src/core/apiClient.ts` 的 `buildImageGenerationRequest()` 原请求体没有要求供应商返回 `b64_json`。
- `src/runtime/webAdapter.ts` 的 `imageToBlob()` 在没有 base64 时会 fallback 到 `fetch(input.image.url)`。
- 静态网页在浏览器安全模型下不能可靠跨域读取供应商临时图片 URL。

本地修复：

- `src/core/apiClient.ts` 已加入 `response_format: "b64_json"`。
- `src/core/apiClient.test.ts` 已补充请求体断言。

验收标准：

- 真实文生图至少 1 次成功，结果可预览、可保存、可进入历史。
- 批量两条提示词至少 2 张成功，历史记录可见。

### P1-002：真实图生图字段名不兼容

模块：单图图生图 / 批量图生图

复现用例：`real-single-image-edit`

实际现象：

- `/images/edits` 返回 HTTP 400。
- 供应商错误包含 `image file is required`。

测试证据：

- 直接 probe 显示 `image[]` 字段不被该供应商识别。
- 使用重复 `image` 字段时，供应商能识别上传图片。

根因定位：

- `src/core/apiClient.ts` 的 `buildImageEditRequest()` 原实现使用：

```ts
payload.append("image[]", image, image.name);
```

本地修复：

- `src/core/apiClient.ts` 已改为：

```ts
payload.append("image", image, image.name);
```

- 图生图请求已补 `response_format: "b64_json"`。
- `src/core/apiClient.test.ts` 已断言 `image[]` 长度为 0，重复 `image` 字段存在。

验收标准：

- 图生图成功，或返回供应商真实能力限制错误。
- 不应再出现 `image file is required` 这类字段名导致的错误。

### P1-003：保存目录授权无法用普通 Playwright 闭环证明

模块：设置 / 保存目录 / 历史预览

实际现象：

- 静态网页不能靠用户手填 `C:\...` 路径获得本地文件写入权限。
- `showDirectoryPicker()` 是浏览器原生目录授权 UI，普通 Playwright 脚本不能像普通输入框一样直接填路径。
- 未授权时，页面会回退到浏览器默认下载目录。

测试证据：

- `src/runtime/webAdapter.ts` 中保存目录依赖 File System Access API 的目录 handle。
- `src/runtime/webAdapter.test.ts` 已有 mock `showDirectoryPicker` 的单元测试，但不能等价证明真实浏览器目录授权。

定位结论：

- 这不是单纯的输入框 bug，而是浏览器安全模型限制。
- 自动化测试应 mock 授权目录行为；真实落点必须保留人工验收。

验收标准：

- 使用 Chrome/Edge，手动授权 `C:\Users\<User>\Downloads\gpt-image-2-studio` 这类子目录。
- 点击测试保存目录后，测试文件能写入并读回。
- 真实生成图片落在授权目录，而不是 Downloads 根目录。
- 刷新页面后，历史预览能从授权目录恢复。

## 4. P2 问题

### P2-001：供应商图片 URL 下载失败时错误不可诊断

模块：错误提示 / 单图 / 批量

实际现象：

- 用户只看到 `Failed to fetch`。
- 该错误无法区分“模型生成失败”和“模型已生成但浏览器下载失败”。

根因定位：

- `src/runtime/webAdapter.ts` 的 `imageToBlob()` 原来直接透传浏览器 fetch 错误。

本地修复：

- `src/runtime/webAdapter.ts` 已把 URL 下载失败转换为业务可读错误。
- `src/runtime/webAdapter.test.ts` 已覆盖 fetch reject 和 HTTP 403 两种场景。

验收标准：

- 只返回 URL 且浏览器无法下载时，错误应明确包含供应商 URL、CORS / 浏览器下载失败、建议使用 `b64_json`。

### P2-002：批量任务的失败语义容易误导用户

模块：批量结果 / 历史记录 / 成本提示

实际现象：

- 供应商接口可能已经 HTTP 200，但页面因保存失败把任务记为失败。
- 用户可能误以为模型没有产生费用，从而重复重试。

定位结论：

- 从用户结果看是失败；从成本监控角度看供应商调用可能已经发生。
- 当前静态版没有服务器侧成本记录，因此至少应在错误文案层面区分“供应商生成失败”和“结果保存失败”。

后续建议：

- 将批量子任务失败原因细分为：请求失败、供应商返回异常、解析失败、保存失败。
- 对保存失败提示“可能已产生供应商调用成本，请先检查保存目录或 CORS / base64 返回配置，不要盲目连续重试”。

## 5. 安全检查

安全约束：

- 真实 `API key`、`Base URL`、文字模型名、生图模型名只允许从 `.env.e2e.local` 读取。
- `.env.e2e.local` 不提交，不写入报告，不进入截图说明。
- 文档中只记录环境变量名，不记录真实值。

已确认：

- `.gitignore` 已忽略 `.env` 和 `.env.*`。
- 当前报告不包含真实密钥、真实 Base URL 或真实模型名。
- 修复链路中生成的 `dist-static` 文件仍需要在提交前执行最终扫描。

提交前必须执行：

```powershell
rg -n "sk-[A-Za-z0-9_-]{24,}|1ts[A-Za-z0-9_-]{20,}" . --glob "!node_modules/**" --glob "!dist/**" --glob "!.git/**"
```

期望结果：

- 不出现真实密钥。
- 如果命中文档中的正则示例，需要人工确认不是泄露。

## 6. 已通过的本地验证

已知通过项：

- `npm run test:run -- src/core/apiClient.test.ts`
- `npm run test:run -- src/runtime/webAdapter.test.ts`
- `npm run test:run`
- `npm run build:static`
- `npm run site:check`

仍需补充：

- 真实供应商 smoke 复测记录。
- 保存目录人工验收记录。
- 最终 secret scan 结果写入复测文档。

## 7. 后续开发入口

基于本报告的开发计划见：

`docs/superpowers/plans/2026-07-06-static-html-e2e-page-hardening.md`

补充计划见：

`docs/superpowers/plans/2026-07-06-static-html-page-e2e-automation-and-save-dir.md`

## 8. 代码审查补充发现

本节来自修复后代码审查，属于继续加固项。它们不推翻前面的主要修复结论，但会影响发布前质量门槛。

### 计划完成状态复核

原修复计划 `docs/superpowers/plans/2026-07-05-static-html-e2e-fixes.md` 的完成状态如下：

- Task 1 至 Task 6：已满足当前证据。请求兼容性、图生图字段名、URL 下载诊断、测试、构建、静态站点检查和密钥扫描均已有通过记录。
- Task 7：未完全满足。当前复测文档记录的是真实供应商 API 级 smoke，证明请求构造和供应商响应形态正确；但原 Task 7 要求的是静态页面级 smoke，包括页面预览、历史记录、保存目录授权、真实文件落点、刷新后历史预览恢复。当前复测文档明确写着这些仍需人工或更强浏览器测试。

因此，当前状态不能宣称“完整 E2E 目标已完成”。下一阶段必须把 Task 7 拆成独立验收任务，并补上页面级证据。

### P1-004：URL 脱敏仍可能被嵌套错误消息绕过

模块：错误提示 / 安全脱敏 / 供应商图片 URL 下载

定位文件：

- `src/runtime/webAdapter.ts`
- `src/runtime/webAdapter.test.ts`

现象：

- 当前错误文案没有主动拼接 `input.image.url`，这一点是正确的。
- 但 `imageToBlob()` 会把 `getRuntimeErrorMessage(error)` 原样拼到 `Original error` 后面。
- 如果浏览器、polyfill、扩展或测试 mock 抛出的错误消息中包含签名图片 URL、私有网关地址或临时 token，UI 仍可能展示该敏感 URL。

当前证据：

- `src/runtime/webAdapter.ts` 中 URL 下载失败错误会附加原始异常消息。
- `src/runtime/webAdapter.test.ts` 已覆盖普通 `TypeError("Failed to fetch")`，但没有覆盖“异常文本本身带 URL”的情况。

期望结果：

- 用户可看到错误类型，例如 `Failed to fetch`、`HTTP 403`。
- 不应展示完整签名 URL、query string、私有 token、私有 Base URL。
- 测试应构造 `TypeError("Failed to fetch [redacted-url]")`，并断言最终 UI 错误不包含完整 URL 和 token。

安全影响：

- 这是 P1 安全加固项。静态页面本身不应替用户扩散供应商临时 URL 或私有端点。

### P2-003：测试没有证明 base64 保存链路端到端可用

模块：API 客户端 / 保存适配层 / 单图与图生图回归测试

定位文件：

- `src/core/apiClient.test.ts`
- `src/runtime/webAdapter.test.ts`

现象：

- 请求体测试已证明发送了 `response_format: "b64_json"`。
- 但部分成功 mock 响应仍只返回 `url`。
- `parseImageGenerationResponse()` 同时支持 `b64_json` 和 `url`，因此这些测试不能证明“真实静态网页现在走 base64 解码保存链路”。

期望结果：

- 至少补一个文生图端到端单元测试：mock provider 返回 `b64_json`，`generateImages()` 解析后交给 `webAdapter.saveImage()`，断言不会调用 `fetch(providerUrl)`，并能写入历史。
- 至少补一个图生图端到端单元测试：mock `/images/edits` 返回 `b64_json`，断言 multipart 使用重复 `image` 字段，保存链路不依赖供应商 URL。

影响：

- 这是 P2 测试完整性问题。当前真实 smoke 已证明供应商能返回 base64，但长期回归测试还不够强。

### P2-004：`static-versions` 源归档一致性仍依赖人工检查

> 2026-07-12 closure: resolved in v0.1.7. Strict parity is anchored to commit `1c35245852f95a7aa0baad14d8b1817d968c685c`, compares every version in that manifest including v0.1.6, and permits only versions absent from the anchor as new archives.

模块：静态发布 / 版本固定目录 / 发布前检查

定位文件：

- `scripts/static-site-check.mjs`
- `static-versions/versions/v0.1.4/index.html`
- `dist-static/versions/v0.1.4/index.html`

现象：

- 当前 `static-versions/versions/v0.1.4/index.html` 与 `dist-static/versions/v0.1.4/index.html` 已人工同步。
- 但 `npm run site:check` 只检查 `dist-static` 内部一致性，没有检查源归档 `static-versions` 是否与构建产物一致。
- 未来如果只构建了 `dist-static`，忘记同步 `static-versions`，`site:check` 仍可能通过。

期望结果：

- `scripts/static-site-check.mjs` 应增加源归档一致性检查。
- 检查至少覆盖当前版本目录：`static-versions/versions/v${packageJson.version}/index.html` 与 `dist-static/versions/v${packageJson.version}/index.html` 内容一致。
- 若源归档缺失或内容不一致，`npm run site:check` 应失败并给出清晰错误。

影响：

- 这是 P2 发布质量问题。它不会影响当前已同步的版本，但会降低后续版本发布可靠性。

## 9. 安全检查清单

提交或推送前必须重新执行：

```powershell
npm run test:run
npm run build:static
npm run site:check
rg -n "sk-[A-Za-z0-9_-]{24,}|1ts[A-Za-z0-9_-]{20,}" . --glob "!node_modules/**" --glob "!dist/**" --glob "!.git/**"
```

需要人工确认：

- 文档中只允许出现环境变量名、正则示例、占位说明。
- 不允许出现真实 API key、真实 Base URL、真实模型名、供应商签名图片 URL。
- 错误提示测试必须覆盖“嵌套错误消息包含 URL”的情况。
- 保存目录真实落点仍需要 Chrome/Edge 人工复测，不能仅凭普通 Playwright 宣称完成。

## 10. 页面级自动化基础设施缺口

本节来自只读子代理复核，目的是明确“为什么当前不能直接宣称页面级 E2E 已完成”。

### 证据

- `package.json` 当前只有 `build:static`、`site:check`、`preview`、`test:run` 等脚本，没有 `e2e` 或 Playwright 页面级测试脚本。
- `npm ls playwright @playwright/test @vitest/browser-playwright --depth=0` 的结果为空，说明项目当前没有安装页面级浏览器自动化依赖。
- `vite.config.ts` 与 `vite.static.config.ts` 的测试环境是 `jsdom`，适合组件/单元测试，不等价于真实 Chrome/Edge 页面级测试。
- `src/App.smoke.test.tsx` 明确 mock 掉保存能力，`saveImage` 与 `saveBatchImage` 不在该 smoke 测试中执行，因此它不能证明真实生成后的保存、历史、目录授权链路。

### 结论

- 当前自动化能证明请求构造、base64 解析、运行时保存逻辑、静态构建和安全扫描。
- 当前自动化不能证明真实页面中“生成图片 -> 预览出现 -> 写入授权目录 -> 历史可恢复”的完整用户路径。
- File System Access API 的原生目录授权弹窗仍需要 Chrome/Edge 人工验收，除非后续引入更复杂的浏览器权限注入方案。

### 对开发计划的影响

- 下一阶段应优先补一个最小页面级 E2E 基础设施，用于验证页面加载、配置保存、单图/批量页面状态、历史记录写入等不依赖原生目录选择器的路径。
- 保存目录真实落点应继续保留人工验收步骤，并把验收记录写入复测文档。
- 任何真实供应商测试都必须从 `.env.e2e.local` 读取配置，测试报告只记录通过/失败和脱敏错误类型，不记录 API key、Base URL、模型名、供应商图片 URL 或完整响应。
