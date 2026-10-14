# mock e2e 覆盖矩阵 — 2026-09-14

- 套件:`tests/e2e/static-html-page.spec.ts`(17 用例,chromium + chromium-pixel-7)、`tests/e2e/static-html-file-page.spec.ts`(3 用例,chromium-file)。
- 本轮(T2)新增 4 条:单图图生图、单图浏览器下载回退(含脱敏断言)、批量取消剩余、file:// 生图。全部通过(15 passed + 2 skipped[桌面跳 @mobile 属正常] / file 套件 3 passed)。
- 真连套件 `static-html-real-provider.spec.ts` 见 T3 契约矩阵(docs/stepfun-contract-20260914.md)。

## 功能 × 形态矩阵

✓=已覆盖(编号为 static-html-page.spec.ts 用例序号;F#=file 套件);△=部分覆盖;✗=空位;N/A=当前版本无此入口。

| 功能 \ 形态 | 单图页(静态 http) | 批量页(静态 http) | file:// 打开页 | 移动端(Pixel 7) |
|---|---|---|---|---|
| text2img | ✓#5 | ✓#7(批量即多任务) | ✓F3(新增) | ✓#6 |
| img2img(参考图) | ✓#14(新增,multipart 字段断言) | ✓#9(全局+任务级参考图) | ✗(低优先:与 http 同代码路径) | △(#6 未含参考图) |
| 批量执行(并发/间隔) | — | ✓#7 | — | △ |
| 排队控制(取消/暂停) | — | ✓#16(新增,取消→skipped、无多余调用) | — | — |
| 失败重试 | —(单图无重试入口) | ✓#8(单任务重试不重复调用/不重复历史) | — | — |
| 历史(写入/分组/查看) | ✓#5/#17 | ✓#7(批次展开) | ✓F3(新增) | ✓#6 |
| 保存:授权目录 | ✓#17 | ✓#13 | △(F2 存储降级) | — |
| 保存:浏览器下载回退+脱敏 | ✓#15(新增,reason 不泄漏 token) | ✓#12 | — | — |
| 工作区恢复(重载) | — | ✓#10 | — | — |
| 存储 memory-only 降级 | — | — | ✓F2 | — |
| 欢迎页/首次路由 | ✓#3 | — | △(F1/F3 隐式) | ✓#4 |
| 移动端无横向溢出 | — | — | — | ✓#4/#6 |
| provider 切换(多 profile) | N/A:App 无多 profile 管理 UI(核心能力已在 providerProfiles,UI 未暴露)→ 待用户裁定 | 同左 | 同左 | 同左 |
| provider 字段编辑持久化(保存→重载) | ✓#17(T4 修复后补,断言请求真实打到编辑后 baseUrl + 重载保持;曾为 A 簇 P1 脱同步,红→绿记录见 audit) | — | — | — |

## 已知掩盖点(测试基建)

- 路由 mock 用 `**/images/generations` 通配任意主机 → 从未断言真实请求 baseUrl/model,掩盖了 A 簇(设置编辑不进 active profile,请求继续用旧值)。T4 修复用例将显式断言请求 URL 与 Authorization。
- e2e 种子 config 同时写顶层与 profile 字段(staticHtmlHarness.ts:94-107 写顶层 example.test,profile 仍是 DEFAULT ruoli.dev)→ 实际请求打到 ruoli.dev 也不失败,进一步掩盖脱同步。

## 空位与处置

| 空位 | 处置 |
|---|---|
| img2img @file://、移动端参考图 | 低优先:同代码路径,不扩 |
| provider 切换 UI 用例 | 待 UI 暴露多 profile 后补 |
| provider 字段编辑持久化 | T4 随 A 簇修复补(先红后绿) |
| 暂停/恢复(非取消) | 中优先:与取消共用 shouldPause 通道,记 backlog |
