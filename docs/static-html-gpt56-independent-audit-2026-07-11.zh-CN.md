# 静态 HTML 版独立技术审计报告

审计日期：2026-07-11

审计对象：`D:\DemoProject\chatToImage\.worktrees\public-lite-cleanup`

分支：`codex/static-pages-site`

基线提交：`989ea2cb0c55fe6ed3735f12eaa2e835f0357e9e`

说明：该 worktree 当前领先远端分支 3 个提交，并包含大量尚未提交的修改和新增文件。本报告审计的是当前本地工作树快照，不等同于已经部署到 GitHub Pages 的远端版本。

## 1. 结论摘要

前一阶段并非没有成果。单图文生图、自定义批量、AI 规划、静态构建、mock 页面测试、历史记录和目录授权模拟链路都已有可用实现，单元测试基线也较扎实。

但当前不能把这一阶段表述为“完整 E2E 已闭环”或“可以无条件发布”。本轮复审发现 4 类发布阻断问题：

1. 真实图生图页面测试是假阳性，测试在请求完成前即可通过。
2. 保存目录仍缺少真实 Chrome/Edge 落盘证据，批量保存回退还会被 UI 静默吞掉。
3. 固定版本目录会被后续构建覆盖，无法真正承担“回退旧版本”的职责。
4. 图片请求无条件发送 `response_format=b64_json`，与 OpenAI 官方 GPT Image 请求契约不一致，只证明了当前中转站兼容，不能证明官方或其他兼容供应商可用。

建议在下一次公开部署前先完成 P0 项，不要继续以现有绿色测试数量作为发布充分条件。

## 2. 本轮实际验证

### 2.1 自动化结果

- `npm run test:run`
  - 结果：通过。
  - 证据：25 个测试文件，247 个测试通过。
- `npm run build:static`
  - 结果：通过。
  - 证据：TypeScript、Vite 静态构建和单文件内联均完成。
- `npm run site:check`
  - 结果：通过。
  - 注意：该检查当前验证的是“最新版与 v0.1.4 完全相同”，这本身暴露了版本归档语义错误，不能据此证明旧版本不可变。
- `npm run e2e:static`
  - 结果：3 个 mock 页面测试通过，4 个真实供应商测试默认跳过。
- 真实供应商完整页面测试
  - 文生图：13.3 秒后出现预览和历史，证据有效。
  - 自定义双任务批量：17.4 秒后完成 2 张图片和批次历史，证据有效。
  - AI 任务规划：30.6 秒后从 3 调整到 4 个任务，证据有效。
  - 图生图：863 毫秒通过，但断言只检查页面上不存在一段错误文字，证据无效。
- 敏感信息扫描
  - 使用 `sk-` 和已知非 `sk-` 形式的密钥模式扫描当前工作树，未发现匹配。
  - 现有发布脚本内置扫描仍然过窄，详见 P1-005。

### 2.2 官方接口契约核对

OpenAI 官方 OpenAPI 对图片生成请求的说明是：GPT Image 模型总是返回 base64，`response_format` 参数不适用于 GPT Image 模型。来源：

- [OpenAI 官方 OpenAPI](https://github.com/openai/openai-openapi/blob/master/openapi.yaml)

当前实现无条件加入该参数，因此属于“当前供应商实测可用，但不符合官方通用契约”的兼容性实现。

## 3. P0 发布阻断项

### P0-001：真实图生图 E2E 是假阳性

证据：

- `tests/e2e/static-html-real-provider.spec.ts:73-87`
- 测试点击生成后只断言 `image file is required` 的元素数量为 0。
- 该元素在请求开始前本来就是 0，因此断言可以立即成立。
- 本轮单独运行该测试时，页面用例仅耗时 919 毫秒；完整真实测试中仅耗时 863 毫秒，而真实文生图耗时 13.3 秒。
- `docs/static-html-e2e-findings-and-evidence-2026-07-06.zh-CN.md:15,28,219` 和 `docs/playwright-static-html-e2e-fix-verification-2026-07-05.zh-CN.md:54,71` 据此写成“真实图生图页面流程通过”，结论过度。

影响：

- 页面可能尚未收到供应商响应，测试就关闭浏览器并报告成功。
- multipart 字段虽已有 API 级测试，但上传、请求、响应解析、保存、预览和历史的完整页面链路仍未被证明。

修复方向：

- 等待真实 `/images/edits` 响应。
- 要求 HTTP 成功，并最终出现预览和历史记录。
- 若供应商不支持图生图，应以明确的终态失败，而不是“没有出现某句错误”为通过条件。
- 修正两份历史报告中的结论。

### P0-002：E2E 可能验证旧构建，Pages 发布也没有运行页面测试

证据：

- `package.json:16-17` 的 E2E 脚本只运行 Playwright，不先执行 `build:static`。
- `playwright.static.config.ts:16-20` 使用 `vite preview` 读取已有 `dist-static`。
- `playwright.static.config.ts:18` 在本地允许复用 4174 端口上的现有服务，可能连接到旧构建或其他工作树。
- `.github/workflows/pages.yml:42-45` 只构建和运行 `site:check`，没有运行 Playwright。

影响：

- 源码已经变化时，E2E 仍可能对旧 HTML 报绿。
- GitHub Pages 可以在没有页面级回归验证的情况下部署。

修复方向：

- 将 mock E2E 固定为“先构建，再启动不可复用的预览服务，再测试”。
- Pages 工作流至少运行 mock E2E。
- 真实供应商 E2E 保持手动或受保护环境触发，不进入公开 PR 的普通 CI。

### P0-003：保存目录功能仍未形成可信闭环

证据：

- `src/runtime/webAdapter.ts:415-452` 的单图保存会返回 `saveMode` 和 `saveFallbackReason`，单图 UI 能显示回退。
- `src/runtime/webAdapter.ts:455-510` 的批量保存也会返回相同信息。
- `src/core/batchRunner.ts:165-172` 只保留 `outputPath`、`previewUrl` 和耗时，丢弃了批量保存方式及回退原因。
- `src/core/batchTypes.ts:23-39` 的 `BatchTask` 没有保存方式字段。
- 当前 mock 测试模拟了 File System Access API，但没有证明原生目录选择器、真实权限和真实磁盘落点。
- 用户已有“授权目录后仍落到默认 Downloads 根目录”的真实反馈。

影响：

- 批量任务可以显示“成功”，但实际只是浏览器默认下载，用户不知道授权目录写入失败。
- 历史记录保存的路径可能与真实文件位置不一致，刷新后无法恢复预览。
- 当前文档只能证明模拟对象工作，不能证明用户机器上的真实目录能力。

修复方向：

- 把 `saveMode` 和 `saveFallbackReason` 写入批量任务及 manifest。
- 批量摘要单独显示“生成成功但保存回退”的数量。
- 保存目录状态应区分“记录过目录名”“当前有权限”“目录测试通过”。
- 完成 Chrome/Edge 原生目录授权、测试文件读写、真实图片落盘、刷新后历史恢复的人工验收。

### P0-004：图片请求参数只兼容当前供应商，不符合官方 GPT Image 契约

证据：

- `src/core/apiClient.ts:100-108` 对文生图无条件发送 `response_format: "b64_json"`。
- `src/core/apiClient.ts:127-140` 对图生图 multipart 也无条件发送该字段。
- 官方 OpenAPI 说明 GPT Image 模型总是返回 base64，该参数不适用于 GPT Image 模型。

影响：

- 当前中转站可能要求或容忍该参数，但官方端点或其他严格兼容实现可能返回 400。
- 工具定位是支持用户自定义 Base URL，不能把单一供应商行为硬编码成通用协议。

修复方向：

- 默认遵循官方协议并省略该参数。
- 在设置中提供明确的供应商兼容选项，例如“强制请求 base64 响应”，只在用户开启时发送。
- 文生图和图生图使用同一能力配置，并补官方模式、兼容模式两套测试。

## 4. P1 高优先级问题

### P1-001：单任务重试存在并发和陈旧状态覆盖风险

证据：

- `src/components/BatchPanel.tsx:802-835`
- 重试开始时没有把批次状态设置为 `running`，`isRunning` 仍可能为 false。
- 请求结束后使用闭包中的旧 `tasks` 执行 `tasks.map(...)`，可能覆盖请求期间的其他状态修改。

影响：

- 用户可以在重试过程中继续清空、编辑或发起其他操作。
- 多次快速重试或重试期间的 UI 修改可能被最后一次旧状态覆盖。

建议：

- 增加任务级重试锁或统一运行态。
- 使用函数式状态更新，持久化时读取最终状态快照。
- 增加“失败一次后重试成功”和“双击重试只发一次请求”的页面测试。

### P1-002：AI 规划数量与 items 数量不一致时会丢任务或显示矛盾

证据：

- `src/core/batchPromptSplitter.ts:126-153` 只解析并过滤 items，不校验 `recommendedCount === items.length`。
- `src/components/BatchPanel.tsx:534-560` 先采用推荐数量，再对 items 执行 `slice(0, recommendedCount)`。

影响：

- 模型返回 4 个 items 但缺少 recommendedCount 时，初始任务数为 3 会截掉第 4 个任务。
- 模型返回 recommendedCount=4 但只有 3 个有效 items 时，输入框显示 4，任务卡片却只有 3 个。
- 这会重新出现用户此前反馈的“韩国任务消失”问题。

建议：

- 自动规划模式下，以经过校验的有效 items 数量作为最终事实。
- recommendedCount 与 items.length 不一致时阻止自动回填或明确提示，不允许静默 slice。
- 超过 20 个任务时进入用户确认，不静默截断。

### P1-003：供应商原始错误可能直接显示给用户

证据：

- `src/core/apiClient.ts:255-262,304-310` 将完整响应正文拼进异常消息。
- `src/App.tsx:146-147` 直接返回 `error.message`。
- `src/i18n/translations.ts:1408` 已存在 `formatClassifiedError`，但当前没有被实际调用。

影响：

- 供应商返回正文可能包含签名 URL、内部路由、请求标识、调试信息或上游 token。
- 页面错误过长且难以理解，也会把供应商实现细节暴露给普通用户。

建议：

- 在 API 边界保留结构化诊断，但进入 UI 前统一脱敏和分类。
- 用户只看到状态、可执行建议和短请求标识。
- 完整响应不写入 localStorage、历史、测试报告或 Playwright artifact。

### P1-004：API key 默认明文持久化，真实测试 artifact 也可能保存密钥

证据：

- `src/runtime/webAdapter.ts:328-333` 将完整 `AppConfig` 写入 localStorage，其中包含 API key。
- `tests/e2e/helpers/staticHtmlHarness.ts:13-42` 把真实测试配置注入 localStorage。
- `playwright.static.config.ts:12-14` 在失败时保留 screenshot、trace 和 video。

影响：

- GitHub Pages 同源下未来部署的任何脚本都能读取之前保存的 key。
- 真实供应商测试失败时，trace 或 DOM 快照可能包含本地测试密钥和 Authorization 请求信息。

建议：

- 默认只在内存或 sessionStorage 保存 key。
- 增加用户主动选择的“记住 API key”选项，并说明风险。
- 真实供应商测试使用独立 Playwright project，关闭 trace、video、screenshot，或增加可靠的 header/DOM 脱敏。

### P1-005：发布密钥扫描范围过窄

证据：

- `scripts/static-site-check.mjs:11-16` 只识别 `sk-` 形式。
- `scripts/static-site-check.mjs:45-49` 跳过大于 10 MB 的文件。
- `scripts/release-readiness.mjs:18-24` 同样只检查 `sk-`。

影响：

- 非 `sk-` 供应商密钥、Bearer token、签名 URL 和大文件内嵌密钥不会阻止发布。

建议：

- 使用统一的 `secret-scan` 脚本覆盖 tracked、untracked 待提交文本文件和最终 dist。
- 至少包含多种 token 结构、URL query token、Authorization 文本和本地 E2E 密钥的精确值比对。
- 发布工作流只输出文件路径和规则名，不输出命中的秘密本身。

### P1-006：已完成的关键 UI 流程缺少页面级覆盖

当前 Playwright mock 只有 3 条主路径：

- `tests/e2e/static-html-page.spec.ts:11` 单图成功。
- `tests/e2e/static-html-page.spec.ts:24` 两条自定义批量成功。
- `tests/e2e/static-html-page.spec.ts:41` 模拟目录授权与历史恢复。

尚未覆盖：

- 失败任务重试、继续未完成、暂停和取消。
- 批量全局参考图与每个子任务独立参考图。
- 图生图成功后的预览和历史。
- 刷新后批量草稿和任务状态恢复。
- 手机视口布局。
- Release 单文件通过 `file://` 直接打开的运行模式。

建议：

- 把上述流程作为 mock E2E 扩充，不依赖真实供应商成本。
- 真实供应商只保留最小契约 smoke。

### P1-007：Blob URL 生命周期不完整，长时间批量使用可能持续占用内存

证据：

- `src/runtime/webAdapter.ts:237-247,373` 会创建图片 Blob URL。
- `src/App.tsx:470-475` 卸载时只清理参考图和历史批次预览，没有清理当前单图预览。
- `src/components/BatchPanel.tsx:168-188` 清空批次时直接丢弃任务，没有回收任务结果的 `previewUrl`。
- `src/components/BatchPanel.tsx:604-632` 修改成功任务提示词时清空 `previewUrl`，也没有先 revoke。

影响：

- 2K/4K 图片和长批次会在页面会话内累积内存。
- 用户不刷新页面连续工作时更容易出现浏览器卡顿或崩溃。

建议：

- 统一实现只处理 `blob:` 的 revoke helper。
- 在替换单图预览、清空批次、修改任务、恢复历史和组件卸载时回收旧 URL。
- 用 Vitest spy 证明每个所有权转移点只 revoke 一次。

### P1-008：Release 工作流的版本元数据仍然写死

证据：

- `.github/workflows/release.yml:12` 手动触发默认值仍是 `v0.1.3`。
- `.github/workflows/release.yml:106` release notes 固定为 `docs/release-notes/v0.1.4.md`。

影响：

- 后续发布新 tag 时可能附带旧版本说明。
- “版本目录、package version、tag、release notes”不能形成同一个可信版本来源。

建议：

- 从 tag 或 package version 推导 release notes 路径并校验存在。
- 发布前检查 tag 与 package version 一致。

## 5. P2 质量与维护性问题

### P2-001：MIT LICENSE 与 package 元数据冲突

- `LICENSE` 是 MIT。
- `package.json:56` 是 ISC。

应统一为 MIT。

### P2-002：为读取版本号把完整 package.json 打进静态页面

- `src/App.tsx:3,40` 默认导入整个 package.json。
- 构建产物中可搜索到 npm scripts 和依赖信息。

应通过 Vite define 或单独的版本模块注入 `APP_VERSION`。

### P2-003：计划文档重复且状态失真

当前同一 E2E 主题至少存在以下重叠计划：

- `2026-07-05-static-html-e2e-fixes.md`
- `2026-07-06-static-html-e2e-hardening.md`
- `2026-07-06-static-html-e2e-page-hardening.md`
- `2026-07-06-static-html-e2e-remediation.md`
- `2026-07-06-static-html-e2e-report-driven-follow-up.md`
- `2026-07-06-static-html-page-e2e-automation-and-save-dir.md`

其中大量步骤仍是未勾选状态，但对应代码已经存在；同时报告中的真实图生图结论又被本轮证明为假阳性。旧计划适合作为历史过程记录，不应继续作为执行状态来源。

本轮新计划 `docs/superpowers/plans/2026-07-11-static-html-audit-remediation.md` 应作为后续唯一执行清单。

### P2-004：真实测试环境加载顺序存在小缺陷

- `tests/e2e/static-html-real-provider.spec.ts:55` 在 `beforeAll` 加载 `.env.e2e.local` 之前执行 `test.skip`。

因此即使文件内设置了 `E2E_REAL_PROVIDER=1`，测试仍可能被跳过，除非 shell 环境另外设置。应在定义 skip 之前加载环境，或统一使用 dotenv。

### P2-005：安全和信任说明仍可更清晰

- 静态页没有 CSP、Referrer-Policy 或 Permissions-Policy。
- 默认 Base URL 指向作者推荐中转站：`src/core/config.ts:48-52`。

动态 Base URL 使严格 CSP 比较困难，但至少应：

- 明确说明 API key 会发送到用户填写的 Base URL。
- 推荐中转站与默认协议行为分开表达。
- 增加 Referrer-Policy，并确保没有第三方运行时脚本。

## 6. 对已完成事项的重新判定

| 项目 | 本轮判定 | 说明 |
| --- | --- | --- |
| 文生图 API 和页面主路径 | 已证明可用 | 单元测试、mock E2E 和真实页面预览/历史均有证据 |
| 自定义两条提示词批量 | 已证明可用 | 真实页面生成、预览和批次历史均完成 |
| AI 自动规划 3 到 4 个任务 | 当前用例可用 | 真实用例通过，但异常计数尚未防御 |
| multipart 使用重复 `image` 字段 | 实现合理 | API 构造与现有供应商兼容，但真实页面成功尚未被现有 E2E 证明 |
| 图生图完整页面链路 | 未证明 | 当前真实 E2E 为假阳性 |
| 授权目录模拟链路 | 已证明 | 只证明 mock API 下的程序逻辑 |
| 真实目录落盘及历史恢复 | 未完成 | 仍需 Chrome/Edge 原生权限验收 |
| 固定版本回退 | 实现语义错误 | 当前构建会覆盖同版本归档 |
| GitHub Pages 发布门禁 | 不充分 | 缺少页面 E2E，secret scan 也不完整 |
| “完整 E2E 已闭环” | 不成立 | 至少图生图和真实目录仍未闭环 |

## 7. 建议执行顺序

1. 修复测试可信度和 Pages 发布门禁。
2. 修复版本归档不可变性。
3. 修复保存目录的状态表达、批量回退和真实验收。
4. 调整图片请求兼容模式，恢复官方契约。
5. 修复批量重试和 AI 计数一致性。
6. 统一错误脱敏、API key 存储和密钥扫描。
7. 补足 file、mobile、失败重试和批量图生图 E2E。
8. 回收 Blob URL，并整理 release 元数据和历史计划。

## 8. 发布建议

当前已部署版本如果实际用户仍能正常完成文生图和批量任务，不需要因为本报告立即下线。

但当前本地工作树不建议直接作为下一版发布。至少完成 P0-001 至 P0-004，并得到真实 Chrome/Edge 保存目录证据后，再进入发布验收。
