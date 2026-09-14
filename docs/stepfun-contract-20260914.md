# StepFun 实连契约矩阵 — 2026-09-14

- 环境:`.env.e2e.local`(E2E_REAL_PROVIDER=1,密钥掩码 `1tsO****Tse4`);`npm run e2e:static:real` 6 用例全过(35.9s)+ 直连探测 4 次。
- 成本:生图 5 张 / 上限 30;文本 3 次 / 上限 60(明细见 docs/e2e-usage-ledger-20260914.md)。

## 1. API base 核实

| 项 | 结论 |
|---|---|
| Base URL | `https://api.stepfun.com/v1`,与官方文档一致,**env 文件无需修改** |
| 认证 | `Authorization: Bearer <key>`,OpenAI 兼容 |
| CORS | 全端点 `Access-Control-Allow-Origin: *`,浏览器静态页(含 file://)可直连(http://127.0.0.1 实测;file:// 实连未测,理论同) |

## 2. 文本模型 step-3.7-flash

| 契约点 | 实测 |
|---|---|
| `/v1/responses`(app 主路径) | **HTTP 200 原生支持**,Responses 形态(`output[].content[]`);reasoning 条目(`type:"reasoning"`,无 `type:"output_text"`)被 app 解析器正确过滤,只读最终 output_text |
| `/v1/chat/completions`(app 回退路径) | HTTP 200,标准 `choices[0].message.content`;额外非标 `reasoning` 字段不影响解析 |
| 回退触发 | 未触发(/responses 直接成功);app 的 404/405/501+关键词回退链保持冗余可用 |
| 提示词拆分(AI 规划) | e2e 实测:主任务 4 国海报 → recommendedCount=4,任务数 3→4,JSON 提取与计数校验全通 |
| 对话 | 探测 "Reply with OK." → 内容正确(附思维链字段,被过滤) |

## 3. 生图模型 step-image-edit-2

| 契约点 | 实测 |
|---|---|
| **纯文生图 `/v1/images/generations`** | **支持**(官方:单模型同时支持文生图+编辑;e2e 单图 t2i 与批量 2 任务均 200)。**无需为 t2i 另配模型** |
| 图生图 `/v1/images/edits`(multipart) | 支持;单参考图 e2e 200 |
| 多参考图 | **实测 2 张重复 `image` 字段 → 200**(未文档化;官方文档写"单图") |
| 输入图限制 | 最小 64px:1px 图 → 400 `image_resolution_exceeded`(中文错误);app 侧无前置校验 |
| 尺寸白名单(t2i) | 仅 `1024x1024, 768x1360, 896x1184, 1360x768, 1184x896`;**2048x2048 → 400 `size_invalid`**(返回白名单)。app 预设的 2K/4K 档位对 StepFun 全部不可用 |
| 编辑模式 size | 官方:编辑场景 size 不生效,输出随输入图尺寸(app UI/历史仍显示配置尺寸) |
| b64_json | force-base64 实测返回 `data[0].b64_json`(与 app 解析器契合);url 模式未测 |
| OpenAI 附加参数 | `n` 支持;`quality/output_format/output_compression` 被容忍(不报错,推断忽略) |
| 响应附加字段 | `finish_reason`(success/content_filtered)、`seed` |

## 4. 错误路径(零成本,故意触发)

| 场景 | 结果 |
|---|---|
| 错误 key | 401 → errorClassifier 归 **auth**;UI `.error-copy` 显示脱敏消息(含 401/认证信息),e2e 断言通过 |
| 错误模型名 | 4xx → 归 provider/unknown;UI 显示含模型信息消息,e2e 断言通过 |
| 错误体形态 | `{error:{message,type,description}}` 与 providerErrors 脱敏/分类链兼容(密钥不回显) |

## 5. OpenAI 兼容性偏差清单(内置 preset 决策输入)

1. 尺寸白名单不同:2K/4K 预设对 StepFun 直接 400(带明确中文报错)——preset 应裁剪尺寸档位。
2. `quality/output_format/output_compression` 被忽略——UI 展示与实际生效参数不一致。
3. 编辑模式 size 不生效,输出随输入。
4. 输入参考图 ≥64px 硬校验,app 无前置提示。
5. edits 多图可用但未文档化(随时可能收紧)。
6. chat/completions 附带非标 `reasoning` 字段(app 兼容)。
7. `/v1/models` 可用(200)——preset 可做模型下拉。
8. key 前缀 `1ts…` 已被仓库 secret-scan 与 providerErrors 凭证正则覆盖。

## 6. 待用户裁定

1. ~~模型下线风险(最紧急)~~ **已裁定(2026-09-14):非产品风险,仅为实连测试基础设施到期**——产品代码零 StepFun 依赖(src/ 与 src-tauri/ 均无引用);官方公告 `/images/edits` 接口与 `step-image-edit-2`、`step-2x-large` 将于 **2026-10-10 停止服务**只影响 `e2e:static:real`,届时替换 `.env.e2e.local` 测试供应商或停用该套件即可,不构成产品迁移决策、不阻断发布。
2. **是否为 t2i 增加独立模型字段**:结论**不需要**——本次测试供应商的 step-image-edit-2 原生支持纯文生图(实测 200)。这只是测试供应商能力结论,不形成产品待办;仅当未来更换的实连测试供应商要求文生图/编辑使用不同模型时,再调整测试配置或评估通用字段设计。
3. ~~是否增加 StepFun 内置 provider 预设~~ **已裁定(2026-09-14):不增加**——StepFun 仅作临时实连测试供应商,不进入产品配置面;下述 preset 设想(baseUrl+模型下拉+尺寸白名单裁剪+64px 校验+默认 force-base64)仅作为未来接入任意尺寸白名单供应商时的技术参考,其中偏差 1/4 在仅作测试用途时不再影响任何用户。
4. url 响应模式、file:// 直连实连未测(低风险,需要时可零成本补)。

## 7. 结论

StepFun 与本应用的 OpenAI 兼容契约**总体良好**:两条文本端点、两种生图路径、b64 返回、错误脱敏分类全部实测通过;不构成阻断。2026-10-10 停服不影响产品(零依赖),到期前仅需更换实连测试供应商;本契约矩阵作为接入 OpenAI 兼容供应商时的实测参考资料保留。
