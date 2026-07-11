# 静态 HTML E2E 修复复测记录

> **历史材料：** 本文已被 2026-07-11 独立审计与修复取代，仅保留用于追溯，不代表当前验证结论。

日期：2026-07-05

复测工作区：`D:\DemoProject\chatToImage\.worktrees\public-lite-cleanup`

说明：真实供应商配置只从 `.env.e2e.local` 读取。本文档不记录真实 API key、真实 Base URL、真实模型名、供应商图片 URL 或完整私有响应。

## 命令

- `npm run test:run -- src/core/apiClient.test.ts`
  - 结果：通过。`1` 个测试文件，`27` 个测试通过。
- `npm run test:run -- src/runtime/webAdapter.test.ts`
  - 结果：通过。`1` 个测试文件，`15` 个测试通过。
- `npm run test:run -- src/core/batchPromptSplitter.test.ts`
  - 结果：通过。`1` 个测试文件，`10` 个测试通过。
- `npm run test:run -- src/components/BatchPanel.test.tsx`
  - 结果：通过。`1` 个测试文件，`19` 个测试通过。
- `npm run test:run`
  - 结果：通过。`25` 个测试文件，`247` 个测试通过。
- `npm run build:static`
  - 结果：通过。静态构建完成并重新生成 `dist-static`。
- `npm run site:check`
  - 结果：通过。输出 `Static site check passed.` 本轮已把 `static-versions/versions/v0.1.4/index.html` 与 `dist-static/versions/v0.1.4/index.html` 的一致性加入该检查。
- `npm run e2e:static`
  - 结果：通过。`2` 个 Chromium 页面级测试通过：单图 mock 生成可在页面预览并写入历史；自定义两条提示词批量 mock 生成可在页面预览并以批次历史记录方式写入历史。
- `E2E_REAL_PROVIDER=1 npx playwright test tests/e2e/static-html-real-provider.spec.ts --config=playwright.static.config.ts`
  - 结果：历史记录原为 `2` 个真实供应商页面级 smoke 通过；本轮已扩展并复测为 `4` 个真实供应商页面级 smoke 通过，详见“2026-07-06 本轮即时复测”。
- `rg -n "image\[\]" static-versions\versions\v0.1.4\index.html dist-static\versions\v0.1.4\index.html`
  - 结果：无命中。`static-versions` 与 `dist-static` 的 v0.1.4 固定版本均不再包含旧的 `image[]` multipart 字段。
- `rg -n "sk-[A-Za-z0-9_-]{24,}|1ts[A-Za-z0-9_-]{20,}" . --glob "!node_modules/**" --glob "!dist/**" --glob "!.git/**"`
  - 结果：无命中。`rg` 退出码为 `1` 表示没有匹配项。

## 2026-07-06 加固复测

- URL 嵌套错误脱敏：通过。`src/runtime/webAdapter.test.ts` 已覆盖 `TypeError` 消息内部携带 provider URL 和 query token 的场景，最终错误文案保留 `b64_json` 诊断建议，但不展示完整 URL、域名路径或 token。
- base64 保存链路：通过。`src/runtime/webAdapter.test.ts` 已覆盖 base64 图片保存时不会调用 `fetch(providerUrl)`，并能写入历史记录。
- API mock 成功路径：通过。`src/core/apiClient.test.ts` 的文生图、图生图、连通性测试成功响应已改为 `b64_json`，避免回归测试只证明 URL 兼容路径。
- 固定版本归档一致性：通过。`scripts/static-site-check.mjs` 已检查当前版本的 `static-versions` 源归档与 `dist-static` 构建产物完全一致。

## 2026-07-06 本轮即时复测

- `npm run test:run`
  - 结果：通过。`25` 个测试文件，`247` 个测试通过。
- `npm run build:static`
  - 结果：通过。静态 HTML 构建成功，并重新生成 `dist-static`。
- `Copy-Item -Force dist-static\versions\v0.1.4\index.html static-versions\versions\v0.1.4\index.html`
  - 结果：通过。固定版本归档已同步本轮构建产物。
- `npm run site:check`
  - 结果：通过。输出 `Static site check passed.`。
- `npm run e2e:static`
  - 结果：通过。`3` 个 mock 页面级测试通过，`4` 个真实供应商页面级测试按默认配置跳过。
- `$env:E2E_REAL_PROVIDER='1'; npx playwright test tests/e2e/static-html-real-provider.spec.ts --config=playwright.static.config.ts`
  - 结果：通过。`4` 个真实供应商页面级 smoke 通过：文生图页面流程、图生图页面流程、自定义两条提示词批量生成、AI 规划任务数量从 3 自动调整到 4 均通过。
- `rg -n "sk-[A-Za-z0-9_-]{24,}|1ts[A-Za-z0-9_-]{20,}" . --glob "!node_modules/**" --glob "!dist/**" --glob "!.git/**" --glob "!test-results/**" --glob "!playwright-report/**"`
  - 结果：无命中。`rg` 退出码为 `1` 表示没有匹配项。

## 真实供应商 Smoke

- 文生图单图：通过。使用当前 `src/core/apiClient.ts` 的请求构造调用真实图片模型，返回 `1` 张图片；结果包含 `b64_json`，未依赖供应商图片 URL。
- 自定义多条提示词批量：通过。串行执行 `2` 条独立提示词，均返回图片；两次结果均包含 `b64_json`。
- 图生图：通过。使用内置 128x128 测试图片调用真实图片编辑接口，返回 `1` 张图片；结果包含 `b64_json`，未依赖供应商图片 URL，且不再出现 `image file is required`。
- AI 任务规划：通过。使用真实文字模型测试“初始任务数量 3，但主任务包含 4 个明确目标”的场景，模型返回 `recommendedCount=4`，且 `items.length=4`。本轮同时加强了规划提示词，明确“用户初始填写的任务数量不是上限”，避免模型把初始数量误当作截断上限。

## 页面级 E2E Smoke

- Mock 单图页面级 smoke：通过。`tests/e2e/static-html-page.spec.ts` 使用 Playwright 打开静态预览页面，mock `/images/generations` 返回 `b64_json`，验证单图生成后 `.preview-panel img` 可见，并且历史记录中可见对应提示词。
- Mock 批量页面级 smoke：通过。`tests/e2e/static-html-page.spec.ts` 使用自定义两条提示词，mock `/images/generations` 返回 `b64_json`，验证批量完成提示为成功 2、预览区出现 2 张已生成缩略图，并且历史中存在批次记录，展开后可见两个子任务。
- Mock 保存目录页面级 smoke：通过。`tests/e2e/static-html-page.spec.ts` 注入 File System Access API 测试替身，验证“选择并授权目录”“测试保存目录”、单图保存方式显示为“已保存到授权目录”，以及刷新后重新授权同一目录可恢复历史预览。
- 真实供应商页面级文生图 smoke：通过。`tests/e2e/static-html-real-provider.spec.ts` 使用 `.env.e2e.local` 中的脱敏配置打开静态预览页面，完成单图生成，页面预览可见，并且历史记录可见。
- 真实供应商页面级图生图 smoke：通过。测试上传内置 128x128 PNG 参考图并发起图生图调用，未出现 `image file is required`，说明页面级上传链路与 multipart 字段名已通过真实页面 smoke。
- 真实供应商页面级自定义批量 smoke：通过。测试走批量页 UI 创建两条自定义提示词，执行批量生成，验证批量完成提示、2 张预览图和历史批次中的 2 条子记录。
- 真实供应商页面级 AI 规划 smoke：通过。测试初始任务数量为 3、主任务明确包含 4 个目标时，点击“规划任务列表”后任务数量自动调整为 4，并渲染 4 个子任务。
- 说明：页面级 mock smoke 不读取 `.env.e2e.local`，不写入真实 API key、Base URL、模型名、签名图片 URL 或完整供应商响应。

## 保存目录人工验收

- 浏览器：未完成真实人工验收。
- 授权目录：计划使用 `C:\Users\<User>\Downloads\gpt-image-2-studio` 这类 Downloads 子目录，不直接授权 Downloads 根目录。
- 测试保存目录结果：未完成真实人工验收。普通 Playwright 脚本无法直接操作浏览器原生 `showDirectoryPicker()` 目录选择器。
- 真实图片落点：未完成真实人工验收。需要在 Chrome 或 Edge 中点击“选择并授权目录”，再执行“测试保存目录”和一次真实生图。
- 刷新后历史预览：未完成真实人工验收。需要先完成目录授权，再刷新页面并从历史记录恢复预览。

自动化覆盖边界：

- `src/runtime/webAdapter.test.ts` 已通过 mock File System Access API 覆盖授权目录优先写入、授权目录写入失败后回退到浏览器下载、旧历史图片按文件名恢复预览、测试保存目录写读这几类逻辑。
- `tests/e2e/static-html-page.spec.ts` 已通过页面级 mock 覆盖设置页授权目录、测试保存目录、保存到授权目录、刷新后重新授权并恢复历史预览。
- 这些测试证明代码路径和页面交互链路正确，但不能等价证明用户真实浏览器里的原生目录选择弹窗、File System Access handle 持久化和真实磁盘落点。真实落点仍必须由人工在 Chrome/Edge 中确认。

## 安全扫描

- 扫描命令：`rg -n "sk-[A-Za-z0-9_-]{24,}|1ts[A-Za-z0-9_-]{20,}" . --glob "!node_modules/**" --glob "!dist/**" --glob "!.git/**"`
- 扫描结果：无命中，命令退出码为 `1` 表示没有匹配项。补充检查文档中的 `E2E_API_KEY`、`E2E_BASE_URL`、正则示例均为变量名或扫描命令，不是真实密钥或真实供应商地址。

## 残余风险

- 版本归档一致性已补齐：`static-versions/versions/v0.1.4/index.html` 已同步当前构建产物，固定版本目录不再保留旧的 `image[]` 调用方式，并包含 `response_format: b64_json` 链路。
- 保存目录真实落点仍需人工验收。静态网页无法通过手填磁盘路径获得读写权限，必须依赖浏览器目录授权。
- AI 任务规划已针对“初始数量小于主任务明确目标数”的场景加强提示词并复测通过。仍建议后续继续加入结果质量校验：当 `recommendedCount` 与 `items.length` 不一致或子任务明显为空时，页面应阻止自动回填并提示用户重试。
- 当前真实供应商页面级文生图、图生图、自定义批量和 AI 规划 smoke 已通过；但保存目录授权、真实文件落点、刷新后历史预览恢复仍需人工或更复杂的浏览器权限注入测试。
- Task 7 部分补齐：页面级 mock smoke 已证明静态页面的单图/批量预览与历史写入链路可用；真实供应商页面级文生图、图生图、自定义批量和 AI 规划 smoke 已通过；Chrome/Edge 目录授权后的真实文件落点仍未完成，因此仍不能宣称完整真实 E2E 已闭环。
