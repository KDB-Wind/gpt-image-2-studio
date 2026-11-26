# 2026-10-16 项目全面审查

## 任务边界

- 请求：使用 repo-maintenance Skill 分析 GitHub 自有项目，判断是否存在必要修复的问题。范围询问尚未收到答复；本轮按会话上下文审查 gpt-image-2-studio，其余账号仓库未进行代码审查。
- 验收：对当前源码、GitHub Issue/PR/CI 和可执行检查形成可复核结论；区分确认缺陷、条件性风险与验证缺口，给出修复优先级。
- 基线：本地与 GitHub main 均为 `916f43dd1745cba5a0b744fc2b1a165ff3ab84f6`；审查前工作区干净。本轮分支 `codex/repo-review-20261016`。
- 范围：前端交互与异步流程、API 传输及错误、批量执行、供应商配置和凭据、Web/桌面适配器、Rust 存储、构建/归档/CI 及依赖。
- 不包含：收费模型调用、读取真实密钥、产品代码修复、推送、合并、部署、正式发布及对外回复。本轮产出审查记录和必要的本地复现证据。
- 环境：Windows，Node 24.14.0，npm 11.9.0。跨系统与真实原生客户端结论必须有对应证据，不以 mock 或历史 CI 代替。

## 结论

发现 6 项必要修复：2 项 P1（下一轮优先处理），4 项 P2（常规修复）。另有 Linux 原生依赖风险、发布版本差距及过时 PR 待维护。现有测试均通过，说明目前的测试不能覆盖这些边界，并不说明产品没有缺陷。

本轮完成分析与证据整理，没有修改产品代码、现有测试或已归档 HTML，没有调用真实供应商、启动原生应用、推送或改变 GitHub 状态。

## F1 / P1：桌面保存配置的 IPC 参数缺少 input 包装

- 位置：`src/runtime/tauriAdapter.ts:141`、`src-tauri/src/storage.rs:1052`、`src-tauri/src/models.rs:36`。
- 触发：桌面端保存设置，或切换供应商、保存目录及其他最终调用 `runtime.saveConfig` 的操作。
- 根因：前端发送 `{ config, activeProfileApiKey }`；Rust 命令签名是 `save_config(input: SaveConfigInput)`，要求 `{ input: { config, activeProfileApiKey } }`。Serde 的 camelCase 属性只转换结构内部字段，不会自动补外层参数名。
- 证据：调用真实 `tauriAdapter.saveConfig`，用受控 IPC 捕获器记录到 `keys=["config","activeProfileApiKey"]`、`hasRequiredInput=false`。锁定的 Tauri 2.11.1 `src/ipc/command.rs:97` 明确按命令参数名查找顶层键，缺失时返回 `command save_config missing required key input`。
- 影响：真实 IPC 会在进入存储函数之前拒绝请求，配置无法正常持久保存。界面可能先改变内存配置，再提示保存失败；刷新或重启后无法保留。
- 测试缺口：`tauriAdapter.test.ts:283` 本身断言了错误的顶层形状，Rust 测试又直接调用存储函数，两端都没有验证实际 IPC 契约。
- 建议：统一参数封装，增加经过命令反序列化的契约测试；桌面验收覆盖首次保存、重启、供应商切换和清空密钥。
- 证据级别：实际前端调用捕获 + Rust/框架源码确认；未运行原生应用，不将捕获器描述为真实 IPC 测试。
- 依据：[Tauri 命令参数规则](https://v2.tauri.app/develop/calling-rust/#passing-arguments)。

## F2 / P1：生成成功后保存失败，批量继续请求后续图片

- 位置：`src/core/batchRunner.ts:169`、`:197`、`:91`；原生存储错误来源例如 `src-tauri/src/storage.rs:1189`。
- 触发：生成返回图片后，保存阶段因磁盘满、目录创建/写入错误或历史提交失败而拒绝。
- 根因：生成和保存共用同一个 catch；保存错误按供应商错误文本分类，常见本地错误变成 `unknown`。队列只对 `auth` 和 `cost_risk` 暂停，因此继续下一张已知无法可靠保存的生成。
- 复现：3 个串行任务，生成使用本地 fixture，保存统一抛出 `ENOSPC: no space left on device`。结果为 `requests=3`、`saves=3`、3 个任务均 `failed/unknown`，批次 `completed`，`pauseReason=null`。真实供应商调用数为 0。
- 影响：前一张已可能计费、图片又未成功交付时，仍可持续产生后续费用；当前任务也没有保留可用于单独重试保存的结果。
- 建议：区分生成阶段与保存阶段；未能完成保存的结果进入需人工恢复的暂停状态，并尽可能保留结果以便重试保存。并发验收应允许已有在途请求结束，但不再安排新生成。
- 建议回归：磁盘满、历史提交失败、无效 base64 解码、首次保存失败时的串行/并行停止；确认“重试保存”不再次调用生成接口。
- 证据级别：在实际队列函数上执行受控生成与保存故障注入；没有填满真实磁盘或调用收费接口。

## F3 / P2：系统凭据库后端未编译，记住密钥会走 JSON 回退

- 位置：`src-tauri/Cargo.toml:19`、`src-tauri/src/storage.rs:519`、`:562`。
- 根因：依赖声明只有 `keyring = "3"`，未启用 `windows-native` 等平台 feature。锁定的 keyring 3.6.3 没有默认系统后端，未指定平台 feature 时使用 mock store。
- 证据：Windows target 的 `cargo tree --locked --offline -e features -i keyring` 只有 `keyring feature "default"`。该版本源码 `src/lib.rs:296` 在缺少 `windows-native` 时选择 mock；mock 条目之间不会提供真实的持久凭据。
- 影响：`write_api_key_to_keyring` 用新 Entry 回读校验会失败，随后落到配置文件中的 JSON 凭据回退。即使系统凭据库本身正常，也不会真正使用它；修复 F1 后该问题会进入实际保存路径。项目没有启用其他自定义凭据后端。
- 建议：按实际支持平台启用对应后端，Windows 先验证全新 Entry 回读、跨进程恢复及删除；保留已存在回退数据的迁移和明确的降级提示。不要未经平台验证就同时开启所有平台 feature。
- 证据级别：当前 target 的实际 feature 解析 + 精确依赖版本源码确认；本轮没有操作用户系统凭据库。
- 依据：[keyring 3.6.3 后端 feature 说明](https://docs.rs/keyring/3.6.3/keyring/#crate-provided-credential-stores)。

## F4 / P2：桌面本地图片预览协议未启用

- 位置：`src/runtime/tauriAdapter.ts:155`、`:161`、`:208`、`:221`；`src-tauri/tauri.conf.json:22`、`src-tauri/Cargo.toml:22`。
- 根因：桌面新图、历史预览与历史转参考图依赖 `convertFileSrc` 的 asset URL；配置没有 `assetProtocol.enable` 和允许路径，Windows target 的实际 feature 树也没有 `protocol-asset`。
- 影响：保存路径可以是有效文件，但 WebView 没有对应文件服务，预览和读取历史原图的流程不能正常完成。前端测试将 convertFileSrc 和 fetch 替换，构建检查也不会发现这个配置遗漏。
- 建议：为应用实际保存或用户明确选择的图片路径提供受限访问方案，或增加受控读取图片命令；避免直接开放整个磁盘。覆盖自定义目录、默认目录、重启后的历史和以历史图片开始编辑。
- 证据级别：实际构建 feature 树与项目配置确认；未进行原生 WebView 图片加载验收。
- 依据：[Tauri convertFileSrc 的协议与 scope 要求](https://v2.tauri.app/reference/javascript/api/namespacecore/#convertfilesrc)。

## F5 / P2：桌面“打开文件”命令缺少 ACL 权限

- 位置：`src/runtime/tauriAdapter.ts:238`、`src-tauri/capabilities/default.json:6`。
- 根因：适配器调用 `openPath`，实际执行 `plugin:opener|open_path`；能力文件只有 `opener:default`。锁定的 opener 2.5.4 默认权限包含 open-url、reveal-item-in-dir 及默认 URL scope，不包含 open-path。
- 影响：从历史或结果中打开已保存文件时，即使文件存在，也会被命令权限拒绝。
- 建议：根据产品行为选择 reveal 文件，或者为已保存图片配置必要的 open-path 权限及路径 scope；同时测试允许路径成功、范围外路径被拒绝，不简单放开任意路径。
- 证据级别：应用配置、实际 SDK 命令和锁定插件权限清单确认；未运行系统文件打开动作。
- 依据：[Tauri Opener 默认权限](https://v2.tauri.app/plugin/opener/#default-permission)。

## F6 / P2：Web 清空密钥时不检查持久写入失败

- 位置：`src/runtime/webAdapter.ts:809`、`:840`、`:842`，以及 `src/App.tsx:1597`。
- 触发：已有被记住的密钥，随后存储写入被拒绝，用户清空输入并保存。
- 根因：`saveConfig` 忽略 `writeStoredValue` 返回的持久性结果，失败只写入内存覆盖层，然后正常 resolve。界面把保存视为成功；专门的 `clearProviderApiKey` 有持久性检查，但设置清空路径没有使用该保证。
- 复现：使用独立假存储与合成占位密钥，先正常保存，再注入 localStorage 写入/删除拒绝；清空并保存不 reject，当前读取看似为空，持久副本仍存在。清除内存模拟刷新并恢复存储访问后，旧密钥重新加载。
- 实际观测：`saveRejected=false`、`currentSessionLooksCleared=true`、`oldKeyStillOnDisk=true`、`keyReturnsAfterReload=true`。
- 影响：用户收到“保存成功”后，密钥的持久副本仍未删除；同类问题也使关闭记住密钥或更新配置的持久性承诺不可靠。
- 建议：区分可降级到内存的普通设置与必须确认删除的凭据操作；删除失败应明确告知，保持可恢复的一致状态，避免显示已彻底清除。
- 建议回归：已有记住密钥后的写入拒绝、清空后刷新、关闭记住后的刷新，以及其他供应商密钥隔离。不能只测试从一开始就不可写且没有旧凭据的存储。
- 证据级别：实际 Web adapter 的存储故障注入；没有读取真实密钥，不声称复现了具体浏览器的存储配额机制。

## GitHub 与交付维护

截至本轮查询，没有开放 Issue。主分支 CI 与 Pages 均对应基线 `916f43d`：

- [CI 38575818191](https://github.com/KDB-Wind/gpt-image-2-studio/actions/runs/38575818191)：Verify、Windows/Linux/macOS Browser job 全部 success。
- [Pages 38575818206](https://github.com/KDB-Wind/gpt-image-2-studio/actions/runs/38575818206)：构建及部署均 success；本轮未重新做公网线上操作验收。
- [PR #6](https://github.com/KDB-Wind/gpt-image-2-studio/pull/6)：目标 Tauri 2.11.1 及 runtime/runtime-wry/utils 四项版本与 main 一致，旧 Verify 通过。建议作为已被包含的更新关闭，不能把旧检查当成当前 head 的检查。
- [PR #7](https://github.com/KDB-Wind/gpt-image-2-studio/pull/7)：目标 tsx `^4.23.13`，main 已是 `^4.23.15`，且锁定修复后的 esbuild；PR 当前冲突。建议核对目标已满足后关闭。
- [PR #8](https://github.com/KDB-Wind/gpt-image-2-studio/pull/8)：目标 Vite `^8.3.0`，main 已是 `^8.3.4`；PR 当前冲突、旧 Verify 失败。建议作为已被超过的更新关闭，无需重新引入旧分支。
- `gh release list` 显示最新公开 Release 仍是 v0.1.4，main 为 0.1.10；从 README 的 Releases 链接下载会得到较旧版本。这属于交付待办，不代表 Pages 没部署。建议修复桌面阻断项并完成原生验收后，再决定发布新版本。

上述关闭 PR 和发布均只是建议，本轮没有执行。

## Linux 原生条件性风险

- glib 0.18.5 仍在 Linux 原生 GTK/WebKit/Tauri 依赖树，Windows target 的反向树为空。两种 target 都使用当前 lockfile 实际查询过。
- [RustSec RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html) 影响 `>=0.15.0, <0.20.0`，修复为 `>=0.20.0`，涉及 VariantStrIter 未定义行为和潜在崩溃。
- [Dependabot 38575850627](https://github.com/KDB-Wind/gpt-image-2-studio/actions/runs/38575850627) 是安全依赖更新任务失败，并非产品 CI 失败；日志显示现有约束最高可解析 0.18.5，自动升级到修复版本不可行。
- 应在 Linux 原生交付前处理或明确停止支持该交付形态，不能仅直接添加新版 glib、屏蔽告警或据此宣称静态 Web/Windows 同样受影响。本轮没有证明该应用实际触发了受影响函数。

## 实际验证

以下是本轮基线上的新检查；产品源码在检查之后没有修改：

| 命令或检查 | 实际结果 |
| --- | --- |
| `npm run test:run` | 38 文件、664 测试通过 |
| `npm run build` | 类型检查及普通前端构建通过 |
| `npm run site:verify` | 静态构建、站点检查、密钥扫描通过 |
| `npm run artifact:check` | Web/桌面运行时代码隔离检查通过 |
| `npm audit --json` | 全量 0 vulnerabilities |
| `npm run e2e:static:mock:run` | Windows Chromium + Pixel 7 视口模拟：25 passed、3 按设计 skipped |
| `npm run e2e:static:file:run` | Windows Chromium 的本地 HTML 模式：3 passed |
| 本轮受控复现 | F1 前端参数捕获、F2 保存故障、F6 存储故障均得到上述观测 |
| Cargo feature/反向依赖树 | Windows asset/keyring 配置与 Windows/Linux glib 范围已核对 |

本地复现脚本保存在忽略目录 `.codex-review-artifacts/review-20261016/capture-findings.mjs`，从仓库根目录运行 `node --import tsx .codex-review-artifacts/review-20261016/capture-findings.mjs`。它只使用合成数据和受控替身，不调用真实模型或系统凭据库。该脚本属于本地证据，不随本记录自动进入 GitHub；上文保留了触发条件、位置和观测，后续修复应将相应行为测试纳入正式测试。

没有执行收费接口、生图供应商兼容性、原生 Windows 窗口/安装器、原生 macOS/Linux 或实体手机验收。没有变更 Rust 代码，本轮未重跑原生编译和 Rust 单元测试；主分支现有 Verify 通过不代替原生界面验收。本轮文档增量只做相关内容与密钥检查，不重新运行未受影响的 664 项测试。

## 修复顺序与经验

1. 优先修复 F2 的费用扩散风险；F1 同时作为桌面功能恢复的前置条件。
2. 再补齐 F3、F4、F5 的桌面构建、资源和权限契约，并在隔离应用数据的原生环境验收，避免读取或改写已有个人配置。
3. 修复 F6 的持久清除保证，验证明确失败提示及刷新后的事实。
4. 每组修复先保留失败证据，再按 AGENTS.md 运行聚焦检查和构建；涉及发布/静态内容时准备新候选，不覆盖历史 HTML。获准交付后再处理 PR 队列及新版本。

可复用教训：跨语言与平台边界要校验真实契约，不能让 mock 自己定义接口；故障处理需按操作阶段判断，保存失败不能当成普通供应商失败继续消耗费用；“记住/清除密钥”要验证实际后端及刷新后的持久事实。

## 交付状态

- 状态：DONE（审查与记录完成，以上产品问题尚未修复）。
- 修改：本记录；另有忽略目录中的本地复现脚本。产品、测试和静态归档无差异。
- 修订：uncommitted，源码基线 `916f43dd1745cba5a0b744fc2b1a165ff3ab84f6`。
- 交付：local only。
