# 静态 HTML 版独立技术审计报告

审计更新：2026-07-12

审计对象：静态 HTML 发布链路与目录保存体验。

## 1. 结论摘要

此前审计提出的发布级问题已完成修复并经复核。当前自动化状态为：**Fixed and unit-tested**、**Mock E2E verified**、**Real-provider verified**。

唯一未完成的手工发布验收门槛是 Native File System Access：在一个受支持浏览器中完成原生目录授权、真实写读和刷新后历史恢复。它不是自动化代码缺陷；在该手工证据取得前，不得称“完整 E2E 已闭环”或“原生验证完成”。

## 2. 已修复并复核的事项

- 真实目录保存已实现同一浏览器应用实例内的文件与历史串行化及显式持久性，并拒绝真实目录碰撞覆盖。
- 每个单图或批量任务恰好请求一张图片；旧数量值已规范化。
- 前端与桌面端的配置持久化完整覆盖图片响应模式与批量设置。
- `v0.1.6` 已绑定发布与归档；Git blob、链接和路径均受守卫；Release 使用严格校验，Pages 保留非严格当前版本检查并增加历史基线门禁；校验和生成前执行最终一致性检查；已验证 clean HEAD 可复现性和非空工作流测试。
- 先前 clean 构建不一致的根因是 Windows 下内联 SVG 的 CRLF 行尾；统一为 LF 后已解决。

### 2.1 完整 P1 状态台账

下列台账包含已修复项和仍待人工验收项；证据类别只引用本轮已有的 479 单元测试、mock/file/真实服务 E2E、两层密钥扫描和发布/站点门禁，不新增任何证据声明。

| P1 项目 | 状态 | 证据类别 |
| --- | --- | --- |
| 单任务重试并发与陈旧状态覆盖 | Fixed and unit-tested | 已审阅任务；479 测试与 retry mock E2E。 |
| AI 规划数量与 items 一致性 | Fixed and unit-tested；Real-provider verified | 已审阅任务；479 测试、mock E2E、真实服务规划 smoke。 |
| 面向用户的服务错误脱敏 | Fixed and unit-tested | 已审阅任务；479 测试与两层密钥扫描。 |
| 密钥持久化策略与测试 artifact 秘密处理 | Fixed and unit-tested | 已审阅任务；479 测试与两层密钥扫描。 |
| 仓库与发布产物的扩展密钥扫描 | Fixed and unit-tested | 已审阅任务；两层密钥扫描及 release/site 门禁。 |
| 单图、批量、历史、设置、移动端、file、重试、参考图、保存目录页面覆盖 | Mock E2E verified | 10 个 mock 通过、1 个预期跳过；2 个 file 通过。 |
| 保存目录 / Native File System Access（历史 P1-003） | Native manual pending | 自动化 mock/code paths 已通过；真实选择器、权限、磁盘落点和刷新后恢复仍待人工验收。 |
| Blob URL 生命周期清理 | Fixed and unit-tested | 已审阅任务；479 测试。 |
| 发布元数据/版本一致性及真实服务测试激活顺序 | Fixed and unit-tested；Real-provider verified | 已审阅任务；release/site 门禁及 4 个真实服务 E2E 通过。 |
| 目录碰撞不覆盖与同一实例文件/历史串行化与显式持久性 | Fixed and unit-tested | 已审阅任务；479 测试与 mock/file E2E。 |
| 每任务恰好一张图片及旧数量规范化 | Fixed and unit-tested；Real-provider verified | 已审阅任务；479 测试、mock E2E、真实服务 E2E。 |
| 前端与桌面端完整配置持久化 | Fixed and unit-tested | 已审阅任务；479 测试与 mock E2E。 |
| `v0.1.6` 发布/归档守卫、最终一致性、可复现性和工作流测试 | Fixed and unit-tested | 已审阅任务；release/site 门禁、clean HEAD 可复现性及严格归档一致性。 |

## 3. 2026-07-12 控制器复核

| 证据层级 | 状态 | 证据 |
| --- | --- | --- |
| Fixed and unit-tested | 已验证 | `npm run test:run`：33 个文件、479 个测试通过；`npx tsc --noEmit` 通过；`cargo test`：28 通过；`cargo check` 通过。 |
| 构建与发布检查 | 已验证 | `npm run build` 通过（46 个模块），`npm run build:static` 通过（42 个模块）；`npm run site:check` 通过；`npm run release:check` 的 22 个 readiness 测试及 readiness、clean HEAD 可复现性、严格归档一致性均通过。 |
| Mock E2E verified | 已验证 | `npm run e2e:static:mock`：10 通过、1 个预期跳过；`npm run e2e:static:file`：2 通过。 |
| Real-provider verified | 已验证 | `npm run e2e:static:real`：4 通过，无重试。未记录或暴露任何服务配置、服务身份或响应内容。 |
| 安全与变更卫生 | 已验证 | 两层密钥扫描均通过；`git diff --check` 通过。 |
| Native manual pending | 待人工验收 | 尚无原生目录选择器、真实写读或历史恢复的可采信证据。 |

### 3.1 归档校验和

- `v0.1.4`：`1923F7169B032F5FD7105C54E58B1FC10CE01D6E253B70E06661E46B3A84AC2D`
- `v0.1.5`：`72CB38132E9B25F74D960B15D49BC9B105F07E75F254269463889EB4AE64FE22`
- `v0.1.6` 源归档、分发 index 与 lite HTML：`63C131116175AC1ACD527BBBAB34BE72BE5A590A70BDA29D5C01254A7DAD6CAE`

## 4. 原生手工验收

仅需在 **Chrome 或 Edge 之一** 的受支持版本完成一次，并记录浏览器名称与准确版本。使用脱敏的授权子目录（例如 `<AUTHORIZED_SUBFOLDER>`），不得记录真实用户名或完整私人路径。

验收必须覆盖：

1. 授权子目录及测试文件写入、读回。
2. 单图输出落入授权目录。
3. 批量输出及 manifest 落入授权目录。
4. 刷新后历史预览恢复。

一次 Computer Use 尝试不能作为证据：当时仅打开了 Edge，自动化未能稳定建立 URL/上下文，随后用户按 Esc；没有取得原生选择器、写入、读回或历史恢复证据。

## 5. 已批准的残余限制

- 保存队列只在同一浏览器应用实例内协调；其他标签页、进程或外部写入者理论上仍可竞争。
- 若浏览器文件写入 Promise 永不 settle，该实例的保存队列可能停滞。
- 时间点一致性检查不能阻止具有更高权限的外部进程在检查后修改文件。

## 6. 发布表述

可表述为“自动化验证完成，真实服务 smoke 已验证”。不得表述为“完整 E2E 已闭环”或“Native File System Access 已验证”，直到第 4 节的手工验收完成并有可复核证据。

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
