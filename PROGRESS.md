# PROGRESS — 2026-09-14 全轮审计/测试/修复会话

## T6 审核整改任务边界

- **请求结果与验收标准**:修正审核发现的三项问题：六个 provider 连接字段都有明确回归断言；先红记录不再声称保留了不存在的原始输出，并提供可复核依据；交接时 Git 工作树不再残留 `dist-static/versions/` 未跟踪产物。
- **范围内文件/模块**:`src/App.test.tsx`、本轮审计/进度文档，以及未跟踪的 `dist-static/versions/` 构建产物。
- **明确排除与外部效果**:不修改运行时代码；不处理 Rust keyring 清除问题及既有 P2/P3 待办；不跑 StepFun 实连、不 push、不发布、不部署。
- **未解决问题/阻塞**:无。历史失败原始日志未实际保留，因此只记录可由父提交与回归测试复核的失败条件，不补造原始日志。

## 任务边界(Agents.md 要求的可恢复任务记录)

- **预期成果**:src/ 100% 逐文件审计落盘;vitest + mock e2e 全绿且覆盖矩阵落盘;StepFun 实连契约矩阵 + 成本台账完整;P0/P1 修复(先红后绿);门禁记录 + 三件套草稿落盘。
- **范围内文件/模块**:src/(core/components/runtime/i18n/根组件)、tests/e2e 三套 spec、scripts 静态构建链、docs/ 产出物、PROGRESS.md。
- **明确排除与外部效果**:禁止 push、发布 release、部署 Pages、改分支保护。唯一授权外部效果:用 .env.e2e.local 的 StepFun 密钥本机实连 e2e(生图 ≤30 张、文本 ≤60 次,台账 docs/e2e-usage-ledger-20260914.md)。
- **未解决问题/阻塞**:无(初始)。

## 密钥纪律

- API key 只存在于 .env.e2e.local(git 已忽略);展示一律掩码 `1tsO****Tse4`。
- 每次 commit 前跑 `npm run secret:scan`。

## 断点记录

- [完成] T0(2026-09-14 00:40 前后):
  - 未提交项处置:vite.config.ts(vitest 排除 .worktrees)→ commit 1ce5f90;AGENTS.md 入库 → 8ea0434;.gitignore 增忽略 .video_agent/ → dfd8238。
  - 基线:`npm run test:run` → 35 文件 / 569 测试全通过(24.7s)。
  - mock e2e:首次失败 `error: unknown command 'test'`——根因 node_modules 缺 @playwright/test(且 PATH 中 Python playwright 抢占);`npm install` 修复后 `npm run e2e:static:mock` → 12 passed / 2 skipped(@mobile 桌面跳过,移动项目已跑)/ exit 0。
  - 环境修复(npm install)不改仓库文件;package-lock.json 无变化。
- [完成] T1(commit 808e19d):docs/audit-20260914.md 落盘,src/ 100% 覆盖。审计后实测扩大 P1 面:mergeConfig 中 profile 压过顶层(tsx 实证),设置页所有连接字段(baseUrl/textModel/imageModel/responseMode/apiKey)当次会话不生效且重载回退(A-0…A-3)。
- [完成] T2(本 commit):新增 4 条 mock e2e(单图图生图/单图下载回退脱敏/批量取消/file:// 生图,全绿:page 15p+2s、file 3p)+ i18n validation 键集守卫单测;覆盖矩阵落盘 docs/e2e-coverage-matrix-20260914.md(含 e2e 掩盖点分析);全量 vitest 570 全绿。
- [完成] T3(commit 见 git log):
  - 前置修复:openCleanStaticPage 种子补写 provider profile(harness 脱同步会让实连打到 ruoli.dev)→ commit e9eee89(含 2 条零成本错误路径用例;期间发现 secret:scan 对 ≥20 字符假 key 报 sensitive-assignment,已缩短假 key 并 amend,扫描通过)。
  - 实连:`npm run e2e:static:real` **6/6 全过**(错误 key/错误模型分类 ✓、t2i ✓、img2img ✓、批量 ✓、AI 规划 3→4 ✓)。
  - 探测:/responses 原生 200、/chat/completions 200、/models 200、CORS *;多参考图 edits 200(未文档化);2048x2048 → 400 size_invalid(白名单 5 档);输入图最小 64px。
  - 契约矩阵:docs/stepfun-contract-20260914.md;台账:docs/e2e-usage-ledger-20260914.md(图 5/30、文 3/60)。
  - **重大用户裁定项**:官方公告 step-image-edit-2 与 /images/edits 将于 2026-10-10 下线。
- [完成] T4:
  - 修复前的未提交测试运行记录(非原始 runner 日志):01:03:14 / 01:03:55，App.test.tsx 两条新测试分别失败于「fetch 0 次」(会话内 key 不生效)与「profile 收到 test-key/ruoli.dev/gpt-image-2 旧值」(持久化脱同步)。原始输出当时未保存；T6 已在 `5be3658^` 上只应用新增测试并隔离复现，原始关键输出见 `docs/settings-profile-sync-red-evidence-20260914.md`。
  - 修:App.updateConfig 对 baseUrl/apiKey/textModel/imageModel/imageResponseMode/rememberApiKey 六字段同步写入 active profile(+ ProviderProfile 类型导入与 isProviderProfileField 守卫)。
  - 绿:vitest 572/572;npm run build ✓;mock e2e 16 passed+2 skipped(含新回归 #17 settings edits reach outbound requests and survive reload)。
  - 残留未修(待用户裁定):桌面清除 key 被 keyring 复活(需 Rust);P2 12 项未修(按纪律不修,已记录)。
- [完成] T5:
  - 门禁(终态):test:run 572/572 ✓;e2e:static:mock 16 passed+2 skipped ✓;secret:scan ✓;site:check ✓(中间态因源码领先 v0.1.7 归档而预期失败,交接态恢复归档字节后通过;原始行落盘 docs/gates-20260914.md)。
  - 三件套草稿:docs/maintenance-drafts-20260914.md(CHANGELOG 条目、版本号建议 v0.1.8、release notes 草稿)。
  - T5 当时的交接态:dist-static 受跟踪 html 恢复 HEAD 字节;dist-static/versions/ 为 build:static 生成的未跟踪产物。

- [完成] T6(审核整改):
  - `src/App.test.tsx` 的保存回归现逐一断言 baseUrl/apiKey/textModel/imageModel/imageResponseMode/rememberApiKey，并同时核对 active profile 与顶层兼容镜像。
  - 在隔离 worktree 的修复前提交 `51bdb95` 上仅应用新增测试，复现 2 failed / 36 passed；关键原始输出落盘 `docs/settings-profile-sync-red-evidence-20260914.md`，同时纠正 T4 对历史证据性质的表述。
  - 删除可由 `build:static` 再生的 `dist-static/versions/` 未跟踪文件；不触碰两个受跟踪静态 HTML，Git 状态不再因构建产物变脏。

## T7 发布前修复轮任务边界(批次 1-3)

- **请求结果与验收标准**:按用户裁定的优先级修复 B-7(历史形状守卫,双端启动可靠性)、B-1(生成成功但历史刷新失败误标 failed)、B-9+B-10+B-11(批量重试/完成路径错误边界)、B-4(选目录只持久化已保存配置)。每项先红后绿、独立 commit。
- **范围内文件/模块**:`src/runtime/webAdapter.ts`(B-7 守卫)、`src/App.tsx`(B-7 init 隔离、B-1、B-4)、`src/components/BatchPanel.tsx`(B-9/10/11)、`src/i18n/translations.ts`(新增 history 加载失败文案)、对应 `*.test.ts(x)`。
- **明确排除与外部效果**:第 4 批 keyring 簇(B-8 + Rust 清除命令)本轮不动;不跑 StepFun 实连、不 push、不发布、不部署;B-2/B-5/B-3/B-6/B-12 仍留待用户裁定。
- **未解决问题/阻塞**:无。

- [完成] T7(批次 1-3,每项先红后绿、独立 commit):
  - B-7(commit 97d0adb):webAdapter.loadHistory 数组守卫;App loadApp 将历史加载移出致命 Promise.all,失败降级为空历史 + historyLoadFailed 文案(zh/en 新键)。红:webAdapter `TypeError: records is not iterable`;App 级整个初始化失败。
  - B-1(commit 4075da3):handleGenerate 中 reloadHistory 独立 try/catch,失败降级为 historyWarning 而非 failed;预览不再被撤销;历史警告渲染不再要求 memory-only。注意:旧测试 "releases a saved preview when refreshing history fails" 把缺陷断言成预期,已改写为 "keeps the saved preview alive"(保留 UI 态 + URL 账本双断言);红证据以最终测试形态经 git stash 复核(expected null not to be null)。
  - B-9+B-10+B-11(commit 70e3291):重试失败置任务 failed(safeErrorMessage + classifyBatchFailure + attemptCount+1)并持久化 completed;批次完成收尾(onHistoryChanged/notifyBatchComplete)移出主 try,各自吞错;重试成功且无 failed 任务时清 pauseMessage。红:Unhandled Rejection + 任务卡 running;完成批次被改判 paused;"History refresh failed." 文案残留。
  - B-4(commit 07b5aec):handleChooseDirectory 持久化 `{...persistedConfig, outputDirectory}`(不再带草稿 key),状态用函数式更新保留编辑草稿。桌面端"半截 key 覆盖 keyring"入口随之关闭(桌面 key 语义对齐仍待第 4 批)。
  - 终态门禁(最后变更后):test:run 579/579 ✓(新增 7 测试);npm run build ✓;secret:scan ✓。mock e2e 未重跑:运行时代码变更仅四处错误边界,静态构建产物未变化;如需可在发布前以 e2e:static:mock 复核。
  - **T7 审核整改(GPT5.6 复审后追加)**:①重试路径 catch 边界收窄——persistManifest 失败降级为 setAppMessage 警告、onHistoryChanged 吞错,仅 retrySingleBatchTask 本身失败才置任务 failed(修复"成功重试被后处理失败改判");②B-7 补齐元素级过滤——loadHistory 逐项 normalizeImageRecord,null/残缺记录被过滤,不再于历史分组崩溃。红证据:重试成功+manifest 失败 → succeeded 1/2;重试成功+历史刷新失败 → succeeded 1/2;`[null, {}, "junk"]` → `TypeError: Cannot read properties of null`(与审核者复现一致)。

## 待用户裁定清单(汇总)

1. **StepFun 实连测试供应商到期(2026-10-10,非产品风险)**:产品代码零 StepFun 依赖(src/ 与 src-tauri/ 均无引用);不影响发布与推送;到期前仅需替换实连测试供应商或停用对应实连套件(.env.e2e.local / e2e:static:real)。契约细节见 docs/stepfun-contract-20260914.md。
2. ~~是否增加 StepFun 内置 provider 预设~~ 已裁定(2026-09-14):**不增加**——StepFun 仅作临时实连测试供应商,不进入产品配置面。
3. P2 缺陷 12 项:其中 B-1/B-4/B-7/B-9/B-10/B-11 已于 T7 修复(见上);剩 B-2/B-3/B-5/B-6/B-12 待裁定。
4. 桌面端清除 API key(需 Rust save_api_key 支持覆写/删除)。
5. 多 profile 管理 UI(核心能力已在 providerProfiles,UI 未暴露)。
6. i18n 死键清理、AppLogo aria、staticOpener 弹窗回退等 P3 项。
7. `?aff=mR35` 返利参数保留与否。

## 状态

### T9 桌面 keyring 凭证语义修复任务边界

- **请求结果与验收标准**:修复 B-8/keyring 簇：桌面端清空 API key 或关闭“记住 API key”后，保存必须删除 active profile 的 keyring 与 JSON fallback 持久副本；未勾选时密钥仅保留在当前应用进程内，重启不得回灌；勾选时仍可安全持久化。
- **范围内文件/模块**:`src/runtime/tauriAdapter*`、桌面设置 UI 与 i18n/测试、`src-tauri/src/models.rs`、`storage.rs`、`storage_tests.rs`、Tauri command 注册及本任务记录。
- **明确排除与外部效果**:不改 Web 端既有 session/localStorage 语义；不处理 B-2/B-3/B-5/B-6/B-12；不调用真实 provider、不 push、不发布。测试只能使用假密钥和临时文件/隔离凭证账户。
- **未解决问题/阻塞**:需在实现中保持 legacy key 迁移与多 profile fallback 隔离，清除失败必须显式报错，不能静默声称已删除。
- **红绿证据**:修复前聚焦前端为 3 failed / 47 passed（启动回灌、保存回捞、桌面开关缺失），Rust 两条定向回归均失败（空保存保留旧 fallback、remember=false 仍加载）；修复后前端聚焦 50/50、Rust 全量 38/38 通过。首次全量前端运行另发现 `App.desktop.test.tsx` 把“桌面隐藏记忆开关”固化为旧契约（1 failed / 584 passed），已改为验证桌面开关可用及 fallback 披露。
- **完成**:Tauri 适配器按 active profile 的 remember 语义水合/保存，不再回捞旧 key；桌面 UI 开放记忆开关并披露 JSON 明文 fallback；Rust 新增 `clear_provider_api_key`，且 `save_config` 自身把 false/空 key 强制解释为按 profile 删除 keyring、legacy 与 JSON fallback。旧版错误遗留且 remember=false 的密钥会在启动时清理，不再回灌。

### T8 文档一致性收口任务边界

- **请求结果与验收标准**:清除发布草稿英文段落中已过时的“P2 均未修”和“StepFun 需要产品迁移”表述，并将 StepFun 契约的独立 t2i 模型字段结论限定为测试供应商能力判断。
- **范围内文件/模块**:`docs/maintenance-drafts-20260914.md`、`docs/stepfun-contract-20260914.md`、本任务记录。
- **明确排除与外部效果**:纯文档修正；不改运行时代码、不开始批次 4、不 push、不发布、不调用外部 API。
- **未解决问题/阻塞**:无。
- **完成**:英文 release notes 已同步 T7 六项 P2 修复与五项剩余待办，StepFun 改为独立的测试基础设施提醒；契约第 2 项不再暗示产品迁移。全文旧措辞扫描无命中，`npm run secret:scan` 通过。

DONE(本地交付;CI pending——未 push,发布/Pages/分支保护均未触碰)。
