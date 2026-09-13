# PROGRESS — 2026-09-14 全轮审计/测试/修复会话

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
- [待办] T3:StepFun 实连(先查官方文档核对 base 与接口形态);T4:修复 A 簇(先红后绿);T5:门禁+三件套。
