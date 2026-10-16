# 本地修复 / 2026-10-16

## GitHub 交付范围更新

用户随后授权推送 Image to Studio 的这批修复。交付范围增加：准备 v0.1.11 候选及新的静态归档以满足现有 CI，提交并推送 `codex/local-fixes-20261016`，创建面向 main 的草稿 PR 并核对该提交的 CI。main 当前仍为基线 916f43dd1745cba5a0b744fc2b1a165ff3ab84f6。推送修复分支不触发 Pages；不合并、不打 tag、不发布 Release。其他项目继续保留本地。

以下保留前两轮本地实现与验证事实；后续交付状态另列，不以历史 local only 状态覆盖本次授权。

候选归档验证暴露必要交付修复：archive CLI 在完成源码归档后动态导入 inline 模块，而 inline 又静态导入 archive，入口的顶层 await 形成循环等待，Node 24 退出 13。范围增加 `inline-static-html.mjs` 的入口判断与真实 CLI 子进程回归，消除反向导入；保留已完整生成的 v0.1.11 候选及全部历史归档，通过 inline 脚本同步最终分发目录。真实 CLI 回归覆盖候选文件已准备、manifest 尚待完成的恢复入口，先退出 13、修复后退出 0，确认最终 manifest/HTML 一致。

交付候选验证：`npm run test:run` 为 677 项通过；`npm run build`、`cargo check --manifest-path src-tauri/Cargo.toml`、`npm run site:check`、`npm run secret:scan`、`npm run artifact:check` 及 release-readiness 均通过。归档脚本定向 76 项通过。`npm run release:check` 需要读取已跟踪 HEAD，提交后另行执行，并以确切提交的 PR CI 为最终远端门禁。

PR #11 首轮网页 CI 发现补修遗漏：URL 图片的下载也发生在 saveBatchImage 内，CORS 的 force-base64 提示被通用 retry-save 覆盖。保留专用下载恢复提示，磁盘保存失败继续使用 retry-save；新增下载阶段回归，不放宽已有 E2E。范围包括重建本 PR 尚未合并/发布的 v0.1.11 候选，先备份其旧字节；main 已有 v0.1.10 及更早归档全部保持不变。该候选从未打 tag、发布或部署。

补修后的最终本地回归：前端 678 项；批处理 38 项；完整网页 E2E 25 项通过、3 项按项目配置跳过；file:// HTML E2E 3 项通过；普通与静态构建通过，真实 archive CLI 正常退出。首轮 CI 失败记录保留，后续远端结论须匹配补修后的新提交，不能引用 138a723 的结果代替。此前 Windows 原生复测覆盖保存/凭据/历史流程，最后 CORS 下载提示补修由单元与完整网页 E2E 覆盖；未重新验收发行安装包。

- 授权：修复本轮审查中可本地处理的问题，验证后留在本地，不推送远端。
- 范围：F1–F6（IPC 配置、保存失败停止计费、凭据后端、历史图片读取和打开、Web 凭据持久删除），及其必要回归。
- 验收：对应失败条件不再复现；前端相关测试、构建和必要 Rust 检查通过。原生真机操作与跨平台系统凭据库另列验证边界。
- 排除：付费模型、真实用户凭据、发布归档、推送、合并、部署和外部消息。
- 基线：916f43dd1745cba5a0b744fc2b1a165ff3ab84f6，保留既有审查文档；产品改动 uncommitted / local only。
- 尚待决定：按受控历史文件读取替代全盘 asset scope；打开动作同样只针对应用历史中已保存的图片。

## 修复后复查范围

2026-10-16：用户要求核对 20 项优先级及修复可信度。新增复查 F2 的保存中断恢复：生成完成但保存尚未 resolve、只重试保存过程中刷新、单项重试进入保存阶段。验收要求这些时点序列化后的任务恢复为只保存失败状态，缓存缺失时不得调用生成接口。范围增加 BatchPanel 单项重试的进度回传及相关测试；仍不调用真实模型、不推送远端。

## 结果

DONE：F1–F6 已完成本地实现；分支 `codex/local-fixes-20261016`，uncommitted，local only。原审查记录保留，不覆盖修复前证据。

- `tauriAdapter.ts` 修复配置 IPC 的 input 包装；历史预览按记录 ID 读取；新图复用生成数据预览；文件打开改走只允许历史图片的 native 命令。
- `storage.rs` / `lib.rs` 增加受控读取和打开，校验历史归属、PNG/JPEG/WebP 格式及 64 MiB 大小；没有开启全盘 asset scope。Cargo 按平台启用 keyring 后端并更新锁。
- `batchRunner.ts` 区分生成与保存失败，保存失败暂停后续任务；缓存不含供应商密钥，重试只保存，可选择新的输出目录。`batchTypes.ts` / `batchWorkspace.ts` 保留 retry-save 标记，重启后缓存不存在时拒绝自动重新生成。
- 修复后复查补齐：进入保存 await 前回传 retry-save 进度；批量重试不清掉该标记；恢复保存中的 running 任务时转换为 failed / cost_risk。BatchPanel 单项重试也接入该进度。新增三种断点回归先失败后通过，组件持久化与 Web 存储回归通过。
- `webAdapter.ts` 对明确清空、移除持久密钥和旧版本凭据删除检查真实存储结果，失败时不会正常 resolve。
- 对应适配器、批处理与 Rust 测试增加失效条件。普通 Rust 测试隔离为 mock 凭据库；Windows 原生凭据库验证使用独立合成条目并清理。

## 验证

- 修复后完整前端测试 676 项通过；随后修正测试夹具的 TypeScript 类型，最终 Web 适配器 94 项及构建通过。日志为 `image-post-review-tests.log`、`image-post-review-web.log`、`image-post-review-build.log`。Rust 未在本轮复查修改，沿用上一轮相关检查。
- Rust：46 项通过，1 项需显式调用的真实凭据库测试默认跳过；该 Windows 凭据测试另行运行并通过。包括图片读取/路径边界和文件上限。
- `cargo check`、系统后端 feature 解析、secret:scan、artifact:check 与 npm audit 的结果在汇总日志中记录。

完整原始日志、截图与补丁保存在本地审查工作区，不随代码发布；本记录保留核心操作、结果与边界，远端结果以对应 PR 的检查页为准。

## 验收界限

后续已补 Windows 原生功能复测 12 项：真实 Tauri/WebView2 设置保存/重启、合成系统凭据回读与删除、真实本机 HTTP→PNG 保存→历史预览、Windows opener 请求，以及历史写入故障暂停和只保存重试。为避免读取现有用户数据，验收副本仅改存储根、凭据服务名及应用标识；前端字节与修复版一致，业务逻辑不变。日志、截图、哈希在汇总目录的 `windows-native-acceptance.md` 与 `windows-native/`。

原生复测在候选版本号从 0.1.10 调整为 0.1.11 前完成，业务修复相同；最终 v0.1.11 元数据、构建与静态归档另按交付门禁检查。

没有调用真实供应商或花费模型额度，未断言外部系统图片查看器的显示内容，也未验收发行安装包。macOS/Linux 挂载及凭据库本轮按用户要求暂缓；Linux glib 的既有条件性风险仍需后续平台支持工作处理。

本轮不制作发行候选、不改写历史静态归档；正式交付需另做新版本、静态归档和发行门禁。没有推送、CI、合并、部署或发布，不以本地测试代替发行验收。
