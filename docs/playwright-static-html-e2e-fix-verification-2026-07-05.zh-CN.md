# 静态 HTML E2E 修复复测记录

> **历史材料：** 本文创建于 2026-07-05。早期测试数量、版本号和结论仅代表当时快照；当前状态以 2026-07-12 控制器复核为准。

## 历史范围

本记录保留早期 E2E 修复背景：页面 mock、文件模式和真实服务 smoke 的测试分层，以及原生目录权限不能由普通 Playwright 替代的边界。旧记录中的 247、289、419 测试数及旧版本状态均为历史数据，不是当前 Task 10 证据。

## 当前复核结论（2026-07-12）

- **Fixed and unit-tested：** `npm run test:run` 为 33 个文件、479 个测试通过；`npx tsc --noEmit` 通过；`cargo test` 为 28 通过；`cargo check` 通过。
- **Mock E2E verified：** `npm run e2e:static:mock` 为 10 通过、1 个预期跳过；`npm run e2e:static:file` 为 2 通过。
- **Real-provider verified：** `npm run e2e:static:real` 为 4 通过且无重试。报告不记录服务配置、服务身份或响应内容。
- **构建与发布：** `npm run build` 通过（46 个模块），`npm run build:static` 通过（42 个模块）；`npm run site:check` 通过；`npm run release:check` 的 22 个 readiness 测试及 readiness、clean HEAD 可复现性、严格归档一致性均通过。
- **安全与卫生：** 两层密钥扫描均通过；`git diff --check` 通过。

## 修复状态

以下最终复核项均已修复并审阅：真实目录碰撞不覆盖、同一实例内文件与历史串行化及显式持久性、每任务恰好一张图片及旧数量规范化、完整配置持久化、`v0.1.6` 发布/归档绑定与 Git 守卫、严格 Release、非严格当前版本 Pages 检查与 Pages 历史基线门禁分层、校验和前最终一致性、clean HEAD 可复现性、非空工作流测试。此前 clean 不一致由 Windows 内联 SVG CRLF 引起，LF 规范化已消除该差异。

早期 P1 的完整 P1 状态台账见[独立审计](static-html-gpt56-independent-audit-2026-07-11.zh-CN.md)和[修复计划](superpowers/plans/2026-07-11-static-html-audit-remediation.md)：其中明确保留重试竞态、AI 数量一致性、错误脱敏、密钥与 artifact 处理、扩展扫描、页面覆盖、保存目录原生验收、Blob URL、发布元数据及真实服务测试激活顺序的状态与证据类别。

归档哈希：

- `v0.1.4`：`1923F7169B032F5FD7105C54E58B1FC10CE01D6E253B70E06661E46B3A84AC2D`
- `v0.1.5`：`72CB38132E9B25F74D960B15D49BC9B105F07E75F254269463889EB4AE64FE22`
- `v0.1.6` 源归档、分发 index、lite HTML：`63C131116175AC1ACD527BBBAB34BE72BE5A590A70BDA29D5C01254A7DAD6CAE`

## 原生目录验收仍待完成

Native File System Access 是唯一未完成的手工发布验收门槛，不能由上述自动化结果替代。须在 Chrome 或 Edge 之一的受支持版本中，记录准确版本，并在脱敏子目录 `<AUTHORIZED_SUBFOLDER>` 验证：测试文件写入与读回、单图落盘、批量输出与 manifest 落盘、刷新后历史预览恢复。

此前 Computer Use 尝试不是证据：只打开了 Edge，自动化未能稳定建立 URL/上下文，用户按 Esc；未产生原生选择器、写入、读回或历史恢复证据。

## 已批准限制

- 保存队列仅协调同一浏览器应用实例；其他标签页、进程或外部写入者理论上可竞争。
- 未 settle 的浏览器文件 Promise 可停滞该实例的保存队列。
- 时间点一致性不能阻止特权外部进程随后改写文件。

不得据此文档声称完整 E2E 或原生验证已完成。

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
