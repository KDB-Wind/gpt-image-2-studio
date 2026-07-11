# 静态 HTML E2E 测试定位与证据报告

> **历史材料：** 本文已被 2026-07-11 独立审计与修复取代，仅保留用于追溯，不代表当前验证结论。

日期：2026-07-06

工作区：`D:\DemoProject\chatToImage\.worktrees\public-lite-cleanup`

测试对象：GitHub Pages / 单文件静态 HTML 版 `gpt-image-2-studio-lite.html`。

## 1. 结论

当前静态 HTML 版已经具备基础自动化验证能力：单图 mock 页面级生成、批量 mock 页面级生成、配置保存、历史写入、请求兼容性、base64 保存链路、静态构建、版本归档一致性和密钥扫描都有通过记录。

但还不能宣称“完整真实 E2E 已闭环”。主要原因是：

- 真实供应商页面级文生图和图生图 smoke 已通过，图生图不再失败于 `image file is required`。
- 保存目录真实落点仍未通过 Chrome/Edge 人工验收。普通 Playwright 无法直接操作浏览器原生 `showDirectoryPicker()` 目录授权弹窗。
- 部分失败语义仍需要继续加固，尤其是“供应商可能已经生成，但浏览器保存失败”的用户提示和成本提醒。

## 2. 已验证范围

已通过的验证：

- `npm run test:run`：通过，`25` 个测试文件，`247` 个测试通过。
- `npm run build:static`：通过，静态 HTML 构建成功。
- `npm run site:check`：通过，包含 `dist-static` 与 `static-versions` 当前版本归档一致性检查。
- `npm run e2e:static`：通过，`3` 个 Chromium mock 页面级测试通过。
- 真实供应商 API 级 smoke：文生图、两条自定义批量、图生图、AI 任务规划均有通过记录。
- 真实供应商页面级 smoke：文生图页面流程已通过，能生成预览并写入历史；图生图页面流程已上传内置 128x128 PNG 并通过真实页面 smoke；自定义两条提示词批量生成和 AI 规划任务数量自动调整也已通过真实页面 smoke。
- 密钥扫描：无真实密钥命中。

未完整验证：

- 保存目录真实落点：未完成 Chrome/Edge 人工授权目录后的磁盘落点验证。
- 刷新后历史图片恢复：页面级 mock 已覆盖“刷新后重新授权同一目录可恢复预览”；真实浏览器中依赖原生目录授权和 handle 持久化，仍未完成真实人工验收。
- 长时间高并发压测、大量 4K 成本型测试：未执行。

## 3. P1 问题

### P1-001：真实文生图曾出现 HTTP 200 后页面保存失败

模块：单图 / 批量 / 图片保存。

现象：

- 供应商 `/images/generations` 返回 HTTP 200。
- 页面随后在浏览器下载供应商图片 URL 时失败。
- UI 只显示 `Failed to fetch`，历史记录未写入。

根因：

- 原请求未要求供应商返回 `b64_json`。
- 静态网页在浏览器安全模型下不能可靠跨域读取供应商临时图片 URL。

已修复：

- `src/core/apiClient.ts` 已对文生图请求加入 `response_format: "b64_json"`。
- `src/core/apiClient.test.ts` 已锁定请求体断言。
- 真实供应商 API 级文生图 smoke 证明返回结果包含 `b64_json`。
- 真实供应商页面级文生图 smoke 已通过，页面预览和历史记录均可用。

残余风险：

- 如果未来某个供应商不支持 `b64_json`，页面仍可能退回 URL 下载路径并受 CORS 限制影响。

### P1-002：真实图生图字段名曾不兼容

模块：单图图生图 / 批量图生图。

现象：

- `/images/edits` 返回 HTTP 400。
- 供应商错误包含 `image file is required`。

根因：

- 原 multipart 字段使用 `image[]`。
- 当前供应商期望重复的 `image` 字段。

已修复：

- `src/core/apiClient.ts` 已改为重复追加 `image` 字段。
- 图生图请求同样补充 `response_format: "b64_json"`。
- `src/core/apiClient.test.ts` 已断言不再发送 `image[]`。
- 真实供应商 API 级图生图 smoke 已通过，且不再出现 `image file is required`。

残余风险：

- 真实供应商页面级图生图 smoke 已通过，测试通过稳定的 `single-reference-input` 上传内置 128x128 PNG，未再出现 `image file is required`。

### P1-003：保存目录真实落点未闭环

模块：设置 / 保存目录 / 历史预览。

现象：

- 用户手填 `C:\...` 路径不能让静态网页获得本地写入权限。
- 未授权目录时，浏览器会把文件保存到默认下载目录。
- 普通 Playwright 无法直接操作原生目录授权弹窗。

定位：

- 保存目录依赖 File System Access API 的目录 handle，而不是普通文本路径。
- `src/runtime/webAdapter.test.ts` 只能 mock 授权目录行为，不能等价证明真实 Chrome/Edge 的磁盘落点。

当前证据：

- 单元测试已覆盖授权目录优先写入、授权目录失败后 fallback、历史图片按文件名恢复预览、测试保存目录写读。
- 页面级 mock E2E 已覆盖设置页授权目录、测试保存目录、单图保存到授权目录、刷新后重新授权同一目录并恢复历史预览。
- 真实浏览器人工验收尚未完成。

验收要求：

- 在 Chrome 或 Edge 中授权 `C:\Users\<User>\Downloads\gpt-image-2-studio` 这类子目录。
- 点击测试保存目录，确认测试文件可写入并读回。
- 真实生图后确认图片落在授权目录，而不是 Downloads 根目录。
- 刷新页面后从历史记录恢复图片预览。

### P1-004：URL 脱敏加固

模块：错误提示 / 安全脱敏。

风险：

- 如果嵌套错误消息中带有供应商签名 URL、query token 或私有网关地址，错误提示可能扩散敏感 URL。

已修复：

- `src/runtime/webAdapter.ts` 已对嵌套错误消息做 URL/token 脱敏。
- `src/runtime/webAdapter.test.ts` 已覆盖错误消息包含 URL 和 token 的场景。

验收标准：

- UI 可以展示错误类型和诊断方向。
- UI 不展示完整签名 URL、query token、私有 Base URL。

## 4. P2 问题

### P2-001：URL 下载失败时的错误不可诊断

模块：错误提示 / 单图 / 批量。

现象：

- 用户只看到 `Failed to fetch`。
- 无法区分“模型没生成”和“模型已生成但浏览器无法下载结果”。

已修复：

- `src/runtime/webAdapter.ts` 已把 URL 下载失败转成业务可读错误，提示 CORS / 浏览器下载 / `b64_json` 方向。
- `src/runtime/webAdapter.test.ts` 已覆盖 fetch reject 和 HTTP 403。

### P2-002：批量任务失败语义容易误导用户

模块：批量结果 / 历史 / 成本提示。

问题：

- 供应商调用可能已经发生，但页面保存失败会被用户看到为“失败”。
- 用户可能误以为未产生调用成本而连续重试。

建议：

- 将失败原因至少区分为：请求失败、供应商异常、解析失败、保存失败。
- 保存失败时提示“供应商可能已返回结果并产生调用成本，请先检查保存目录或 base64 返回，不要盲目重复重试”。

### P2-003：base64 保存链路需要长期回归保护

模块：API 客户端 / 保存适配层。

已补齐：

- API mock 成功路径已改为 `b64_json`。
- `webAdapter` 测试已证明 base64 图片保存不会调用 provider URL fetch。

残余风险：

- 页面级真实供应商批量保存仍依赖后续真实页面 smoke 或人工验收。

### P2-004：版本归档一致性需要自动守卫

模块：静态发布 / 固定旧版目录。

已补齐：

- `scripts/static-site-check.mjs` 已检查当前版本的 `static-versions/versions/v0.1.4/index.html` 与 `dist-static/versions/v0.1.4/index.html` 内容一致。

残余风险：

- 后续版本升级时，需要同步更新版本号和固定目录生成策略，避免旧版目录遗留过期构建。

## 5. 关键测试证据

### Mock 页面级 E2E

文件：

- `tests/e2e/static-html-page.spec.ts`
- `tests/e2e/helpers/staticHtmlHarness.ts`

已验证：

- 单图生成后 `.preview-panel img` 可见。
- 历史记录中可见对应提示词。
- 自定义两条提示词批量生成后，批量完成提示为成功 2、失败 0、跳过 0。
- 批量预览区出现 2 张缩略图。
- 历史中存在批次记录，展开后可见两个子任务。
- 保存目录 mock 测试中，设置页测试保存目录通过，单图保存方式显示为“已保存到授权目录”，刷新后重新授权同一目录可恢复历史预览。

### 真实供应商页面级 E2E

文件：

- `tests/e2e/static-html-real-provider.spec.ts`

已验证：

- 文生图页面级流程通过：填写配置、单图生成、预览可见、历史记录可见。

- 图生图页面级流程通过：测试切换到“生成模式”中的“图生图”，上传内置 128x128 PNG，未出现 `image file is required`。
- 自定义批量页面级流程通过：测试创建两条自定义提示词并执行批量生成，页面显示成功 2、失败 0、跳过 0，预览区出现 2 张图片，历史批次中可见 2 条子记录。
- AI 规划页面级流程通过：测试初始任务数量为 3、主任务明确包含 4 个目标时，文字模型规划后任务数量自动调整为 4，并渲染 4 个子任务。

### 单元与构建

通过记录：

- `npm run test:run`
- `npm run build:static`
- `npm run site:check`
- `npm run e2e:static`

### 安全检查

约束：

- 真实配置只允许放在 `.env.e2e.local`。
- 文档和测试报告只写环境变量名，不写真实值。
- 不提交 API key、真实 Base URL、模型名、签名图片 URL 或完整供应商响应。

已执行扫描：

```powershell
rg -n "sk-[A-Za-z0-9_-]{24,}|1ts[A-Za-z0-9_-]{20,}" . --glob "!node_modules/**" --glob "!dist/**" --glob "!.git/**" --glob "!test-results/**" --glob "!playwright-report/**"
```

结果：

- 无真实密钥命中。
- 退出码 `1` 表示无匹配项。

## 6. 下一步进入开发计划的事项

必须优先处理：

- 完成保存目录真实人工验收，并把结果写入复测文档。
- 把批量失败语义继续细分，避免用户把“保存失败”误判为“供应商没有调用”。
- 每次发布前继续执行完整测试、静态构建、站点检查和密钥扫描。
## Task 4 evidence addendum (2026-07-11)

Automated evidence: `npm run test:run` passed with 26 test files and 289 tests; `npm run e2e:static` passed with 5 Chromium mock tests. The fallback batch path keeps generation tasks succeeded, displays authorized-directory and browser-download counts, shows a redacted fallback reason per affected task, and writes `saveMode` plus `saveFallbackReason` into the batch manifest. The authorized-directory path remains covered.

Boundary: Playwright replaces the File System Access API and file store with an in-page mock. It verifies application code paths and UI transitions only; it does not prove the native Chrome/Edge directory chooser, persistent native permission handles, or final file placement on a real disk. Real Chrome/Edge directory selection, write/read testing, batch image and manifest placement, and refresh-time history restoration remain manual acceptance items.

Security: this addendum contains no real API key, Base URL, model name, provider URL, or provider response. Manual acceptance must use private local configuration and must not copy secrets into screenshots, logs, traces, manifests, or repository files.
