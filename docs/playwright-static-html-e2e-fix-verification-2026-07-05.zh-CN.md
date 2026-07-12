# 静态 HTML E2E 修复复测记录

> **历史材料：** 本文创建于 2026-07-05。早期测试数量、版本号和结论仅代表当时快照；当前状态以 2026-07-12 控制器复核为准。

## 历史范围

本记录保留早期 E2E 修复背景：页面 mock、文件模式和真实服务 smoke 的测试分层，以及原生目录权限不能由普通 Playwright 替代的边界。旧记录中的 247、289、419 测试数及旧版本状态均为历史数据，不是当前 Task 10 证据。

## 当前复核结论（2026-07-12）

- **Fixed and unit-tested：** `npm run test:run` 为 32 个文件、451 个测试通过；`npx tsc --noEmit` 通过；`cargo test` 为 25 通过；`cargo check` 通过。
- **Mock E2E verified：** `npm run e2e:static:mock` 为 10 通过、1 个预期跳过；`npm run e2e:static:file` 为 2 通过。
- **Real-provider verified：** `npm run e2e:static:real` 为 4 通过且无重试。报告不记录服务配置、服务身份或响应内容。
- **构建与发布：** `npm run build` 与 `npm run build:static` 均通过（各 47 个模块）；`npm run site:check` 通过；`npm run release:check` 的 21 个 readiness 测试及 readiness、clean HEAD 可复现性、严格归档一致性均通过。
- **安全与卫生：** 两层密钥扫描均通过；`git diff --check` 通过。

## 修复状态

以下最终复核项均已修复并审阅：真实目录碰撞不覆盖、同一实例内文件与历史原子事务、每任务恰好一张图片及旧数量规范化、完整配置持久化、`v0.1.6` 发布/归档绑定与 Git 守卫、严格 Release 与非严格 Pages 分层、校验和前最终一致性、clean HEAD 可复现性、非空工作流测试。此前 clean 不一致由 Windows 内联 SVG CRLF 引起，LF 规范化已消除该差异。

早期 P1 的完整已解决台账见[独立审计](static-html-gpt56-independent-audit-2026-07-11.zh-CN.md)和[修复计划](superpowers/plans/2026-07-11-static-html-audit-remediation.md)：其中明确保留重试竞态、AI 数量一致性、错误脱敏、密钥与 artifact 处理、扩展扫描、页面覆盖、Blob URL、发布元数据及真实服务测试激活顺序的状态与证据类别。

归档哈希：

- `v0.1.4`：`2921ACDD0350D487E0659B0A143C7AC3597DA36AF80DA7FD0A4980190CF19A64`
- `v0.1.5`：`50D653FECF24AFD86F7FB7C9F082555A987BB1610ACABC5AAB93E48F74326056`
- `v0.1.6` 源归档、分发 index、lite HTML：`A81D9D9C0E6E76C95BB66D16ED74F7283B0B3D90397060EF37B44AD2E5FEF129`

## 原生目录验收仍待完成

Native File System Access 是唯一未完成的手工发布验收门槛，不能由上述自动化结果替代。须在 Chrome 或 Edge 之一的受支持版本中，记录准确版本，并在脱敏子目录 `<AUTHORIZED_SUBFOLDER>` 验证：测试文件写入与读回、单图落盘、批量输出与 manifest 落盘、刷新后历史预览恢复。

此前 Computer Use 尝试不是证据：只打开了 Edge，自动化未能稳定建立 URL/上下文，用户按 Esc；未产生原生选择器、写入、读回或历史恢复证据。

## 已批准限制

- 保存队列仅协调同一浏览器应用实例；其他标签页、进程或外部写入者理论上可竞争。
- 未 settle 的浏览器文件 Promise 可停滞该实例的保存队列。
- 时间点一致性不能阻止特权外部进程随后改写文件。

不得据此文档声称完整 E2E 或原生验证已完成。
