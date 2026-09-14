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

## 待用户裁定清单(汇总)

1. **StepFun 模型 2026-10-10 下线**:step-image-edit-2 与 /images/edits 停服,需迁移决策(docs/stepfun-contract-20260914.md §6)。
2. 是否增加 StepFun 内置 provider 预设(尺寸白名单裁剪/64px 输入校验/模型下拉)。
3. P2 缺陷 12 项(B-1..B-12,见 audit;B-9/10/11 为 BatchPanel 错误路径,P3 若干)。
4. 桌面端清除 API key(需 Rust save_api_key 支持覆写/删除)。
5. 多 profile 管理 UI(核心能力已在 providerProfiles,UI 未暴露)。
6. i18n 死键清理、AppLogo aria、staticOpener 弹窗回退等 P3 项。
7. `?aff=mR35` 返利参数保留与否。

## 状态

DONE(本地交付;CI pending——未 push,发布/Pages/分支保护均未触碰)。
