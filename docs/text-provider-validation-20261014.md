# 真实文本接口验收 — 2026-10-14

## 授权与边界

- 用户明确要求使用 Step Plan 的 `step-3.7-flash` 调试文本接口，已提供凭据。本轮真实文本调用在授权范围内，不再请求重复授权。
- 基线：`631dd1e0d334c48c2e4982d086870770d7699521`；工作分支：`codex/step37-text-validation-20261014`。
- 范围：页面中的文字模型连通性、提示词优化、批量任务规划，以及单文件 HTML 的文字连通性；必要的实际缺陷修复和聚焦验证。
- 首轮最多 8 次真实文本 POST（包含客户端尝试 Responses 后的 Chat Completions 回退）；不自动重跑失败用例。禁止图片请求和其他供应商调用，不切换至普通 API 余额计费通道。
- 真实凭据仅暂存于本地、Git 忽略的 `.env.e2e.local`，原计划测试后删除本轮创建的文件；实际清理被自动审批拒绝，详见下文。不写入源码、日志、截图、提交或交付说明。
- 关闭截图、trace、video；证据只保留请求类型、状态、耗时和数值用量，不保存 Authorization、完整响应或供应商返回内容。
- 不合并、发布或部署；图片供应商验收仍未完成。

## 验收标准

- 当前页面使用实际配置向授权的文本接口发出请求，返回结果被产品解析并显示。
- 优化结果非空且实际更新提示词；规划结果解析成 4 张任务卡并调整任务数量。
- 双击 HTML 的文字模型测试可完成；将其与在线静态页分别记录。
- 记录真正发出的请求数、HTTP 状态和用量；明确供应商是否支持 Responses 及回退是否成功，不把接口 200 当作产品验收通过。

## 当前状态

DONE。用户完成实名认证后，四个真实文本页面场景和独立 Chat Completions 兼容调用均通过。下文保留实名认证前的失败证据，最终结果见“实名认证后继续验收”。公开文档确认 Step Plan 图像接口已于 2026-10-10 停止服务：[官方下线公告](https://platform.stepfun.com/docs/zh/announcements/image-model-retirement)、[Step Plan 接入说明](https://platform.stepfun.com/docs/zh/step-plan/overview)。本轮不探测已下线图片接口。

## 首轮结果（实名认证前）与根因

| 操作 | 结果 | 耗时 |
| --- | --- | --- |
| 页面文字模型测试 → Responses | HTTP 403；未进入成功状态 | 258ms（接口响应头） |
| 使用产品请求构造器直连 Chat Completions | HTTP 403 | 278ms |
| 查询模型列表 | HTTP 200，包含用户指定模型 | 未单独记录 |
| Chat Completions 脱敏拒绝原因核验 | HTTP 403，要求完成实名认证 | 205ms（完整响应） |

- 拒绝原因：接口返回 `Identity verification is required to call this API.`，要求在开放平台完成账号实名认证后重试。没有通过改变模型、调用普通计费通道或放宽认证回退来绕过。
- 共 3 次文本 POST + 1 次模型列表 GET，未超过首轮上限；0 次成功文本响应，0 次图片调用。拒绝响应无 token usage；无法仅凭这些响应判断平台是否扣费，不宣称费用必定为零。
- 页面 E2E 为 1 failed / 3 did not run，首次失败即停止且无重试。提示词优化、file:// 文字测试和任务规划尚未完成，不能把模型列表 200 当作真实模型调用通过。
- 当前客户端对 HTTP 403 不自动回退到另一个文本端点；直接访问 Chat Completions 也得到身份验证拒绝，现有行为没有造成该账号限制。本轮未改运行时代码或静态 HTML。

## 可复用测试与证据

- `tests/e2e/static-html-real-provider.spec.ts` 新增在线文字连通性、提示词优化和单文件文字连通性；复用原有四任务 AI 规划用例。
- 设置 `E2E_REAL_TEXT_ONLY=1` 后，浏览器仅允许两个授权文本端点；拒绝图片/其他外部请求，核对模型和鉴权匹配，最多 8 次 POST，并保存受限数值用量及状态。
- 筛选已通过 `--list` 核对为恰好 4 个文本用例，避免 `real text` 的宽泛匹配误选原有 `real text-to-image` 用例。
- 实际命令：`npm run e2e:static:real:run -- --grep 'real text (settings|prompt|file-mode)|real AI planning' --workers=1 --max-failures=1 --retries=0`。
- 脱敏请求台账、模型列表诊断和失败日志位于本地忽略目录 `.acceptance/text-provider-20261014/`，不提交。检查生成的文本诊断未发现密钥。
- 临时凭据文件已设置仅当前 Windows 用户可访问，且不被 Git 跟踪。测试后尝试删除，但组合命令与明确绝对路径的单文件删除均被自动审批拒绝，只给出 `blocked by policy`、未说明更详细原因。没有绕过拒绝；文件仍存在，需要用户手动清理。它不在源码、测试、日志或提交中。

## 首轮后续安排（历史）

- 用户先在阶跃开放平台完成该密钥所属账号的实名认证。此项需要账号持有人处理，Agent 无法代填身份材料。
- 完成后继续同一模型的真实页面验收；届时重新记录调用上限和实际用量，不直接自动重跑本轮失败任务。
- 本次交付仅为本地测试入口和脱敏记录；原 PR #10 的代码及绿色 CI 未改动，未推送、合并或发布。当前提交以 `git rev-parse HEAD` 为准。

## 首轮检查

- `npm run secret:scan`：通过；临时配置与证据目录均被 Git 忽略，凭据文件 ACL 仅当前用户 FullControl。
- Playwright `--list`：4 个预期文本用例；不包含图片生成或编辑用例。
- 新增 E2E 的独立 TypeScript 检查：通过。使用 TypeScript 6 的 `--ignoreConfig` 并包含项目 File System Access 扩展声明。检查暴露已有目录 mock 仅实现产品使用的方法却声明为完整接口；与同文件已有 file-handle mock 一致，明确标注部分测试替身的类型边界，没有改运行行为或放宽产品类型。该检查不发出 API 请求。
- `git diff --check`：通过；本轮没有运行时代码、依赖或静态产物变化，不重复执行已经通过的产品全量回归。
- 真实页面验收仍失败/未执行，属于账号实名认证阻塞；检查源码和测试入口通过不能代替实际模型验收。

## 实名认证后继续验收

- 用户已确认完成实名认证，继续先前授权的同一模型与四个文本场景。本轮最多 8 次文本 POST（含回退和必要诊断），不重试结果不确定的请求，不调用图片模型或普通余额计费接口。
- 保留前一轮的请求台账，另用 `after-verification` 子目录保存本轮证据，避免覆盖拒绝原因的历史记录。
- 验证辅助范围：真实文本测试在页面出现明确失败时及时报告；用独立报告标签区分各轮，并限制每次运行的剩余请求预算。必要时记录不含响应原文的错误分类；不保存成功模型输出或凭据。
- 验收起点是重新发出真实请求，不能把用户完成实名认证本身当作接口验收通过。

### 实际通过结果

| 场景 | 实际验证 | HTTP / 完整响应耗时 | 数值用量（输入 / 输出 / 总计） |
| --- | --- | --- | --- |
| 在线页文字模型连通性 | 页面显示成功状态；模型文本被客户端解析 | Responses 200 / 779ms | 34 / 43 / 77 |
| 提示词优化 | 非空优化结果更新输入框，实际有效提示词同步 | Responses 200 / 3723ms | 58 / 417 / 475 |
| 单文件 HTML 文字连通性 | 直接打开 file:// HTML 后页面显示成功 | Responses 200 / 778ms | 34 / 33 / 67 |
| AI 任务规划 | 原任务数量 3 自动调整为 4；页面产生 4 张任务卡 | Responses 200 / 17813ms | 377 / 2121 / 2498 |
| 独立 Chat Completions 兼容调用 | 使用产品请求构造器与解析器，返回非空文本 | Chat Completions 200 / 2474ms | 28 / 188 / 216 |

- 页面 E2E：4 passed，29.5s，命令 exit 0。独立 Chat Completions 调用 exit 0。
- 本轮共 5 次文本 POST，全部 200；0 次失败、重试或图片请求，守卫阻止的请求数为 0。API 报告合计输入 531、输出 2802、总计 3333 tokens；这不是金额或账单扣费证明。
- 供应商实际支持 Responses，所以页面测试没有触发 Chat Completions 回退；额外直接验证了 Chat Completions。没有据此宣称触发过真实回退或验证过 Anthropic Messages（本产品不使用该接口）。
- 继续验收新增了可限定 1–8 次 POST 的运行参数 `E2E_REAL_POST_LIMIT`，以及安全目录标签 `E2E_REAL_REPORT_LABEL`。本轮选择标签 `after-verification`；前轮台账未覆盖。
- 四个页面测试指向当前 0.1.10 静态候选；本轮没有修改产品运行时代码、模型默认值、依赖或静态 HTML。

### 最终验证与交付

- `npm run e2e:static:real:run -- --grep 'real text (settings|prompt|file-mode)|real AI planning' --workers=1 --max-failures=1 --retries=0`：4 passed；运行时设置 `E2E_REAL_REPORT_LABEL=after-verification`、`E2E_REAL_POST_LIMIT=8`。
- 独立 TypeScript 检查（新 E2E 与项目 File System Access 声明）、`npm run secret:scan`、`git diff --check`：通过。最终诊断文本检查未发现密钥（需要脱敏的文件数为 0）。
- 真实付费验收在本地执行，不声称在 CI 执行。用户已授权推送 GitHub；将本轮测试增强和脱敏记录快进整合到维护分支，更新既有 PR #10，以 PR 当前 head 和实际检查结果复核交付状态。此授权不包含合并 main、发布或部署。
- 生图仍未进行真实供应商验收。先前被自动审批拒绝删除的临时配置仍在本地、只授予当前 Windows 用户访问、被 Git 忽略；本轮没有绕过拒绝，需要用户手动清理 `.env.e2e.local`。
