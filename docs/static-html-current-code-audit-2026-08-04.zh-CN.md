# 当前版本代码审查与复测报告

日期：2026-08-04
范围：`codex/static-pages-site` 分支的完整前端运行时、Web/Tauri 保存适配器、批量任务链路、历史预览、静态构建与安全门禁。
本轮只做本地修复和提交，不推送、不部署。

## 结论

本轮发现并修复 4 个可复现问题，并为每个问题补了回归测试：

1. 批量只成功部分任务时，历史卡片会把成功数误当成总数，例如把 `2/3` 显示成 `2/2`。
2. 单任务重试 Promise 拒绝时，任务会永久停留在“运行中”，同时产生未处理 Promise 拒绝。
3. 快速连续查看历史图片时，较慢的旧请求可能覆盖最后点击的新请求。
4. Tauri 桌面端保存批量图片时没有保存批次元数据，批量历史无法与 Web 端保持一致。

上述问题均已修复，Web 和 Tauri 的保存链路现在都携带批次总数及子任务元数据。

## 复现与修复证据

### 批量历史总数

在 `batchRunner` 测试中构造 3 个任务，断言每次成功保存都收到 `totalTasks: 3`。在 Web 适配器、历史分组和 Rust 存储测试中分别断言该值能够持久化并在只有部分成功记录时保留。

### 单任务重试失败

在 `BatchPanel` 测试中让 `retrySingleBatchTask` 拒绝。修复前任务卡保持 `running`，且 Vitest 报告 unhandled rejection；修复后任务回到 `failed`，显示脱敏错误，批次暂停并释放重试锁。持久化失败与生成失败分开处理，已成功生成的图片不会被误标为失败。

### 历史预览竞态

在 `App` 测试中连续点击两条历史记录，让后一次请求先返回、前一次请求后返回。修复后最终预览保持最后点击的记录，过期请求只释放自己的 Blob URL，不再覆盖界面状态。

### Tauri 批量历史

原生模型新增可选批量元数据，批量保存载荷携带 `totalTasks`，Rust 保存历史记录时写入批次 ID、标题、子任务 ID、索引、标题和总数；单图历史仍明确写入 `batch: null`。

## 自动化验证

本轮实际结果：

- `npm run test:run`：35 个测试文件、595 个测试通过。
- `npm run build`：通过，包含 TypeScript 检查。
- `npm run e2e:static:mock`：17 个通过、3 个预期跳过。
- `npm run e2e:static:file`：2 个通过，覆盖直接打开 HTML 和浏览器存储被拒绝的降级路径。
- `cargo test --manifest-path src-tauri/Cargo.toml`：42 个通过。
- `npm run artifact:check`：通过。
- `npm run secret:scan`：通过。
- `npm run secret:scan:release`：通过。
- `npm audit --omit=dev --audit-level=high`：0 个高危依赖问题。
- `git diff --check`：通过。

真实供应商 smoke 本轮执行后在 304 秒超时，没有将其记为通过，也没有把供应商配置、API key、模型名、完整响应或签名 URL 写入报告。此前已有 4 个真实服务页面 smoke 通过记录；本次超时说明真实服务仍需要单独复测，不能用本地 mock 结果替代。

## 发布与人工验收边界

本轮静态构建更新了 `dist-static` 中的当前未发布 HTML，但没有改写不可变的 `static-versions/versions/v0.1.7`，因此当前 `npm run site:check` 按设计会提示当前 HTML 尚未归档到新的版本。此提交不代表 GitHub Pages 发布，也不代表 Release 更新。

以下事项仍不能由普通 Playwright 完整证明：

- Chrome/Edge 原生目录选择器的真实授权。
- 测试文件和真实图片是否落到用户选定的磁盘子目录，而非浏览器默认 Downloads 根目录。
- 刷新浏览器后，通过真实授权句柄恢复旧图片预览。

此前页面级 File System Access mock 已通过，但它只证明应用代码路径，不证明原生浏览器和真实磁盘。发布前仍需按[本地验收手册](playwright-static-html-e2e-fix-verification-2026-07-05.zh-CN.md)完成一次 Chrome 或 Edge 手工验收。

## 未在本轮扩大范围的已知限制

- 保存队列只协调同一个浏览器应用实例，不能替代跨标签页或外部进程锁。
- 批量工作区刷新后可以恢复提示词和任务状态，但参考图片 `File` 对象不会跨刷新持久化；这是当前明确限制。
- 真实供应商返回 URL 时仍受 CORS 和供应商响应模式影响；对应供应商应使用强制 `b64_json` 档案。
- 当前静态构建和版本归档是两个动作；发布新版本前需要先递增版本、生成归档并通过站点检查。
