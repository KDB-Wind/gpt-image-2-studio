# 静态 HTML E2E 修复复测记录

> **历史材料：** 本文创建于 2026-07-05。早期测试数量、版本号和结论仅代表当时快照；当前状态以 2026-07-12 控制器复核为准。

## 历史范围

本记录保留早期 E2E 修复背景：页面 mock、文件模式和真实服务 smoke 的测试分层，以及原生目录权限不能由普通 Playwright 替代的边界。旧记录中的 247、289、419 测试数及旧版本状态均为历史数据，不是当前 Task 10 证据。

## 当前复核结论（2026-07-12）

- **Fixed and unit-tested：** `npm run test:run` 为 33 个文件、502 个测试通过；`npx tsc --noEmit` 通过；`cargo test` 为 28 通过；`cargo check` 通过。
- **Mock E2E verified：** `npm run e2e:static:mock` 为 10 通过、1 个预期跳过；`npm run e2e:static:file` 为 2 通过。
- **Real-provider verified：** `npm run e2e:static:real` 为 4 通过且无重试。报告不记录服务配置、服务身份或响应内容。
- **构建与发布：** `npm run build` 通过（46 个模块），`npm run build:static` 通过（42 个模块）；`npm run site:check` 通过；设置外部 `STATIC_ARCHIVE_TRUSTED_BASE` 后，`npm run release:check` 的 25 个 readiness 测试及 readiness、clean HEAD 可复现性、严格归档一致性均通过。
- **安全与卫生：** 两层密钥扫描均通过；`git diff --check` 通过。

## 修复状态

以下最终复核项均已修复并审阅：真实目录碰撞不覆盖、同一实例内文件与历史串行化及显式持久性、每任务恰好一张图片及旧数量规范化、完整配置持久化、`v0.1.7` 发布/归档绑定与 Git 守卫、以 `v0.1.6` 为前一稳定锚点的严格 Release、非严格当前版本 Pages 检查与 Pages 历史基线门禁分层、校验和前最终一致性、clean HEAD 可复现性、非空工作流测试。此前 clean 不一致由 Windows 内联 SVG CRLF 引起，LF 规范化已消除该差异。

早期 P1 的完整 P1 状态台账见[独立审计](static-html-gpt56-independent-audit-2026-07-11.zh-CN.md)和[修复计划](superpowers/plans/2026-07-11-static-html-audit-remediation.md)：其中明确保留重试竞态、AI 数量一致性、错误脱敏、密钥与 artifact 处理、扩展扫描、页面覆盖、保存目录原生验收、Blob URL、发布元数据及真实服务测试激活顺序的状态与证据类别。

归档哈希：

- `v0.1.4`：`2921ACDD0350D487E0659B0A143C7AC3597DA36AF80DA7FD0A4980190CF19A64`
- `v0.1.5`：`50D653FECF24AFD86F7FB7C9F082555A987BB1610ACABC5AAB93E48F74326056`
- `v0.1.6` immutable archive: `0E67C34BAF4C4289D4864F6CC8E842DF84C23B14CE94E34C8C2354ECA059AEB3`
- `v0.1.7` current source archive and generated release HTML: `EBDBE76F4E9F731FCA70BDECDC303DA635258F3B8CEC2B96AAEF6C53EB11A9C4`
## 原生目录验收仍待完成

Native File System Access 是唯一未完成的手工发布验收门槛，不能由上述自动化结果替代。须在 Chrome 或 Edge 之一的受支持版本中，记录准确版本，并在脱敏子目录 `<AUTHORIZED_SUBFOLDER>` 验证：测试文件写入与读回、单图落盘、批量输出与 manifest 落盘、刷新后历史预览恢复。

此前 Computer Use 尝试不是证据：只打开了 Edge，自动化未能稳定建立 URL/上下文，用户按 Esc；未产生原生选择器、写入、读回或历史恢复证据。

## 已批准限制

- 保存队列仅协调同一浏览器应用实例；其他标签页、进程或外部写入者理论上可竞争。
- 未 settle 的浏览器文件 Promise 可停滞该实例的保存队列。
- 时间点一致性不能阻止特权外部进程随后改写文件。

不得据此文档声称完整 E2E 或原生验证已完成。

## 2026-07-12 v0.1.7 SPEC Review Closure

Status: automated branch gates passed. Native File System Access manual acceptance remains pending, and the aborted Computer Use attempt is not release evidence. No full/native E2E claim is made.

- Frontend/unit: 33 files, 502 tests passed.
- Builds: normal 46 modules; static 42 modules.
- Emitted-artifact isolation: the normal HTML entry graph reaches the Tauri adapter and bridge markers through the Vite manifest; current static HTML/assets exclude native markers.
- Static mock E2E: 10 passed, 1 intentionally skipped by project selection.
- Static file-mode E2E: 2 passed.
- Real-service static E2E: 4 passed after unit/mock gates; no service configuration, identity, signed URL, or response body is recorded.
- Rust: 28 tests passed; cargo check passed.
- Release readiness: 25 readiness tests passed. Clean-HEAD reproducibility, Pages readiness, both secret scans, TypeScript, archive second-attempt rejection, and strict parity passed with intended external `STATIC_ARCHIVE_TRUSTED_BASE=31774ff698abd999f107e40c49d3de43da5a5f35`; missing external trust-root checks failed closed as intended. This records the local verification value, not an externally confirmed GitHub variable change.

Raw Git archive evidence:

- `v0.1.4`: blob c352aadac324fa8935d3db02735477dafdb02b89; SHA-256 2921ACDD0350D487E0659B0A143C7AC3597DA36AF80DA7FD0A4980190CF19A64.
- `v0.1.5`: blob 77b0000781289d756f75d6c6efc7b763886464e5; SHA-256 50D653FECF24AFD86F7FB7C9F082555A987BB1610ACABC5AAB93E48F74326056.
- `v0.1.6`: blob f1721e4a937ffc887c1159402aeec9383a47ceb8; SHA-256 0E67C34BAF4C4289D4864F6CC8E842DF84C23B14CE94E34C8C2354ECA059AEB3.
- `v0.1.7`: blob 0af8bb435142d59c1cce601a91600ac3555df033; SHA-256 EBDBE76F4E9F731FCA70BDECDC303DA635258F3B8CEC2B96AAEF6C53EB11A9C4 for the source archive and current generated release HTML.

Correction: the authoritative trust root is external `STATIC_ARCHIVE_TRUSTED_BASE`, not any file or commit selected by the ref under validation. Automated local evidence supplied public commit `31774ff698abd999f107e40c49d3de43da5a5f35` through that environment variable. Strict parity therefore protects every version in its manifest through v0.1.7; only versions absent from that base may be added later. Missing or invalid external values fail closed, and no tracked configuration, `HEAD^`, workflow input, or byte normalization can replace the trust root. After each stable archive or Release, maintainers must advance the external variable to a trusted commit containing that archive before preparing later releases.
