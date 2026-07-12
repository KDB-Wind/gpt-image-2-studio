# 静态 HTML E2E 测试定位与证据报告

> **历史材料：** 本文创建于 2026-07-06。早期发现和测试计数只描述当时状态；当前结论由 2026-07-12 控制器复核取代。

## 1. 当前结论

静态 HTML 的自动化验证已完成分层闭环：**Fixed and unit-tested**、**Mock E2E verified**、**Real-provider verified**。这不等于原生目录权限已验证；Native File System Access 手工验收仍是唯一未完成的发布验收门槛。

## 2. 当前证据（2026-07-12）

- `npm run test:run`：32 个文件、451 个测试通过。
- `npm run build`：通过，47 个模块。
- `npm run build:static`：通过，47 个模块。
- `npm run site:check`：通过。
- `npm run release:check`：21 个 readiness 测试，以及 readiness、clean HEAD 可复现性、严格归档一致性均通过。
- `npm run e2e:static:mock`：10 通过、1 个预期跳过。
- `npm run e2e:static:file`：2 通过。
- `npm run e2e:static:real`：4 通过、无重试；未记录服务配置、服务身份或响应内容。
- 两层密钥扫描均通过；`npx tsc --noEmit` 通过；`cargo test` 为 25 通过；`cargo check` 通过；`git diff --check` 通过。

## 3. 最终修复状态

已修复并审阅：

- 真实目录碰撞不覆盖，以及同一浏览器应用实例内的文件和历史原子事务。
- 每个单图或批量任务恰好请求一张图片，并规范化旧数量。
- 前端与桌面端完整配置持久化，包括图片响应模式和批量设置。
- `v0.1.6` 发布/归档绑定、Git blob/链接/路径守卫、严格 Release 与非严格 Pages 的分层、校验和前最终一致性、clean HEAD 可复现性与非空工作流测试。
- Windows 内联 SVG CRLF 导致的先前 clean 不一致；LF 规范化已修复。

早期 P1 的完整已解决台账见[独立审计](static-html-gpt56-independent-audit-2026-07-11.zh-CN.md)和[修复计划](superpowers/plans/2026-07-11-static-html-audit-remediation.md)：其中明确保留重试竞态、AI 数量一致性、错误脱敏、密钥与 artifact 处理、扩展扫描、页面覆盖、Blob URL、发布元数据及真实服务测试激活顺序的状态与证据类别。

归档哈希：

- `v0.1.4`：`2921ACDD0350D487E0659B0A143C7AC3597DA36AF80DA7FD0A4980190CF19A64`
- `v0.1.5`：`50D653FECF24AFD86F7FB7C9F082555A987BB1610ACABC5AAB93E48F74326056`
- `v0.1.6` 源归档、分发 index、lite HTML：`A81D9D9C0E6E76C95BB66D16ED74F7283B0B3D90397060EF37B44AD2E5FEF129`

## 4. 原生手工验收

在 Chrome 或 Edge 之一的受支持版本中，记录准确版本，并对脱敏子目录 `<AUTHORIZED_SUBFOLDER>` 完成：目录测试文件写入和读回、单图输出落盘、批量输出及 manifest 落盘、刷新后历史预览恢复。不得记录真实用户名、完整私人路径、密钥、服务配置、服务身份、签名链接或原始响应。

此前 Computer Use 尝试不构成验收证据：Edge 曾被打开，但自动化无法可靠建立 URL/上下文，随后用户按 Esc；没有原生选择器、写入、读回或历史恢复证据。

## 5. 已批准残余限制

- 保存队列仅覆盖同一浏览器应用实例；其他标签页、进程或外部写入者仍可能竞争。
- 浏览器文件 Promise 若永不 settle，可使该实例队列停滞。
- 时间点一致性不能阻止特权外部进程在检查后修改文件。

因此，当前可称自动化和真实服务 smoke 已验证；不得称完整 E2E 闭环或原生目录验证完成。
