# Static HTML Audit Remediation Implementation Plan

> 状态更新：2026-07-12。本计划的自动化修复与复核已完成；原生目录手工验收仍待完成。

**Goal:** 修复静态 HTML 审计项，并以分层证据记录发布状态。

**Architecture:** 保持静态应用架构。自动化验证与原生浏览器权限验收分开记录，避免把 mock 或真实服务 smoke 误写为原生文件系统验证。

## 完成状态

### 已完成并复核

- [x] 真实目录碰撞不覆盖；同一浏览器应用实例内文件写入与历史写入串行执行，并显式报告持久性。
- [x] 单图与批量任务均恰好请求一张图片；旧数量已规范化。
- [x] 桌面端和前端配置持久化完整覆盖图片响应模式及批量设置。
- [x] `v0.1.7` 发布与归档绑定，`v0.1.6` 作为前一稳定锚点；Git blob、链接、路径守卫完整；Release 严格校验、Pages 非严格当前版本检查与历史基线门禁区分明确。
- [x] 最终一致性检查在校验和之前执行；clean HEAD 可复现性和非空工作流测试已验证。
- [x] Windows 内联 SVG 的 CRLF 是先前 clean 不一致根因；LF 规范化已修复。

### 完整 P1 状态台账

下表包含已修复项和仍待人工验收项，仅归纳现有 495 单元测试、mock/file/真实服务 E2E、两层密钥扫描和发布/站点门禁。

| P1 项目 | 状态 | 证据类别 |
| --- | --- | --- |
| 单任务重试并发与陈旧状态覆盖 | Fixed and unit-tested | 已审阅任务；495 测试与 retry mock E2E。 |
| AI 规划数量与 items 一致性 | Fixed and unit-tested；Real-provider verified | 已审阅任务；495 测试、mock E2E、真实服务规划 smoke。 |
| 面向用户的服务错误脱敏 | Fixed and unit-tested | 已审阅任务；495 测试与两层密钥扫描。 |
| 密钥持久化策略与测试 artifact 秘密处理 | Fixed and unit-tested | 已审阅任务；495 测试与两层密钥扫描。 |
| 仓库与发布产物的扩展密钥扫描 | Fixed and unit-tested | 已审阅任务；两层密钥扫描及 release/site 门禁。 |
| 单图、批量、历史、设置、移动端、file、重试、参考图、保存目录页面覆盖 | Mock E2E verified | 10 个 mock 通过、1 个预期跳过；2 个 file 通过。 |
| 保存目录 / Native File System Access（历史 P1-003） | Native manual pending | 自动化 mock/code paths 已通过；真实选择器、权限、磁盘落点和刷新后恢复仍待人工验收。 |
| Blob URL 生命周期清理 | Fixed and unit-tested | 已审阅任务；495 测试。 |
| 发布元数据/版本一致性及真实服务测试激活顺序 | Fixed and unit-tested；Real-provider verified | 已审阅任务；release/site 门禁及 4 个真实服务 E2E 通过。 |
| 目录碰撞不覆盖与同一实例文件/历史串行化与显式持久性 | Fixed and unit-tested | 已审阅任务；495 测试与 mock/file E2E。 |
| 每任务恰好一张图片及旧数量规范化 | Fixed and unit-tested；Real-provider verified | 已审阅任务；495 测试、mock E2E、真实服务 E2E。 |
| 前端与桌面端完整配置持久化 | Fixed and unit-tested | 已审阅任务；495 测试与 mock E2E。 |
| `v0.1.7` 发布/归档守卫、`v0.1.6` 稳定锚点、最终一致性、可复现性和工作流测试 | Fixed and unit-tested | 已审阅任务；release/site 门禁、clean HEAD 可复现性及严格归档一致性。 |

### 2026-07-12 验证证据

- [x] `npm run test:run`：33 个文件、495 个测试通过。
- [x] `npm run build`：通过，46 个模块。
- [x] `npm run build:static`：通过，42 个模块。
- [x] `npm run site:check`：通过。
- [x] 设置外部 `STATIC_ARCHIVE_TRUSTED_BASE` 后，`npm run release:check`：25 个 readiness 测试，以及 readiness、clean HEAD 可复现性、严格归档一致性均通过。
- [x] `npm run e2e:static:mock`：10 通过、1 个预期跳过。
- [x] `npm run e2e:static:file`：2 通过。
- [x] `npm run e2e:static:real`：4 通过、无重试；不记录服务配置、服务身份或响应内容。
- [x] 两层密钥扫描均通过。
- [x] `npx tsc --noEmit` 通过。
- [x] `cargo test`：28 通过；`cargo check` 通过。
- [x] `git diff --check` 通过。

### 归档一致性

- [x] `v0.1.4`：`2921ACDD0350D487E0659B0A143C7AC3597DA36AF80DA7FD0A4980190CF19A64`
- [x] `v0.1.5`：`50D653FECF24AFD86F7FB7C9F082555A987BB1610ACABC5AAB93E48F74326056`
- [x] `v0.1.6` immutable archive：`0E67C34BAF4C4289D4864F6CC8E842DF84C23B14CE94E34C8C2354ECA059AEB3`
- [x] `v0.1.7` current source archive and generated release HTML：`EBDBE76F4E9F731FCA70BDECDC303DA635258F3B8CEC2B96AAEF6C53EB11A9C4`

## 唯一待完成门槛

- [ ] Native File System Access 手工验收。

在 Chrome 或 Edge 之一的受支持版本中，记录准确浏览器版本，并使用脱敏子目录 `<AUTHORIZED_SUBFOLDER>` 完成：目录测试文件写入和读回、单图落盘、批量输出与 manifest 落盘、刷新后历史预览恢复。不得记录真实用户名、路径、密钥、服务配置、服务身份、签名链接或原始响应。

此前 Computer Use 尝试不构成验收：仅打开 Edge，自动化未能稳定建立 URL/上下文，用户随后按 Esc，未产生选择器、写入、读回或历史恢复证据。

## 已批准残余限制

- 保存队列仅覆盖同一浏览器应用实例；其他标签页、进程或外部写入者仍可能竞争。
- 永不 settle 的浏览器文件 Promise 可使该实例队列停滞。
- 时间点一致性不能阻止特权外部进程在检查后改写文件。

**Sign-off:** 自动化状态为 Fixed and unit-tested、Mock E2E verified、Real-provider verified。Native manual pending 是唯一未完成的手工发布验收门槛，不是自动化代码缺陷。
