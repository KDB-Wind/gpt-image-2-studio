# 供应商配置档案设计

**Date:** 2026-07-18  
**Status:** Approved design, implementation pending

## Context

当前静态工具只有一组全局供应商配置：Base URL、API Key、文字模型、图片模型和图片响应模式。不同供应商对图片响应格式的兼容性不同：有的直接返回 `b64_json`，有的返回图片 URL；当 URL 所在服务器不允许浏览器跨域读取时，生成可能已经完成，但网页无法保存或预览图片。

当前页面已经支持“官方 GPT Image 模式”和“中转站强制 base64”，但响应模式是全局的。用户切换供应商时必须手动修改多项字段，容易把 URL、模型和响应模式配错。

## Goals

- 支持多个相互独立的供应商配置档案。
- 每个档案独立保存 Base URL、API Key、文字模型、图片模型和图片响应模式。
- 在单图和批量页面提供快速切换入口。
- 在设置页提供档案的新增、编辑、删除和完整管理。
- 旧版单供应商配置自动迁移为“默认供应商”。
- CORS 图片 URL 失败时给出明确的 base64 操作建议，但不自动重试。
- 不将 API Key、请求头或签名图片 URL写入公开 HTML、历史记录或 Git 仓库。
- 不在页面文案中绑定任何具体供应商或模型名称。

## Non-Goals

- 不实现供应商自动测速、自动路由或成本排序。
- 不在 URL 下载失败后自动切换模式并重新调用图片模型。
- 不在本期加入服务端密钥托管。
- 不改变单图、批量、AI 拆分、历史和下载目录的业务流程。
- 不向公开 GitHub Pages 暴露任何维护者自己的 API Key 或供应商配置。

## Terminology

“供应商配置档案”是用户保存的一组完整调用配置。档案名称由用户自定义，例如“日常生图”或“备用渠道”。档案 A、档案 B 不代表固定供应商类型。

“图片响应模式”只有两种：

- `official`：遵循官方 GPT Image 兼容行为，不主动追加 `response_format`。
- `force-base64`：请求 `response_format: "b64_json"`，优先避免浏览器读取供应商图片 URL 的 CORS 风险。

CORS 是 API 服务或图片 URL 服务器的浏览器跨域策略，不是图片模型本身的能力。供应商是否接受 `response_format` 是另一项兼容性问题。

## Data Model

配置升级为版本化结构，包含：

```text
schemaVersion
activeProviderProfileId
providerProfiles[]
通用生图设置
批量设置
语言与欢迎页设置
```

每个 `providerProfiles[]` 项在运行时包含：

```text
id
name
baseUrl
textModel
imageModel
imageResponseMode
rememberApiKey
apiKey（仅运行时，不进入档案元数据持久化）
```

持久化的档案元数据不包含 `apiKey`。API Key 按档案 ID 单独存储：

- 浏览器 Web 模式且 `rememberApiKey=true`：存入当前浏览器本地存储。
- `rememberApiKey=false`：只存入当前会话存储。
- 不把 API Key 写入构建产物、GitHub Pages 文件或公开文档。
- 删除档案时删除该档案对应的本地和会话 Key。

浏览器本地存储不是密码管理器，页面应继续提示用户不要在公共电脑上记住 API Key。

## Migration

旧版配置首次加载时执行一次幂等迁移：

1. 读取旧的全局 Base URL、API Key、文字模型、图片模型、响应模式和记住 Key 设置。
2. 创建名称为“默认供应商”的档案。
3. 将旧字段迁移到该档案，保留原来的 Key 保存策略。
4. 将 `activeProviderProfileId` 指向该档案。
5. 保留通用生图、批量、语言和欢迎页设置。
6. 写入新 schema，后续加载不得重复创建档案。

如果旧配置损坏，则创建一个空的“默认供应商”档案并让用户重新配置。迁移不能覆盖用户已经存在的新 schema 配置。

最多允许 20 个档案。始终至少保留一个档案，唯一档案不能删除。

## UI And Interaction

### Settings

设置页新增“供应商档案”区域：

- 当前档案选择器。
- `新建档案`。
- `删除档案`。
- 可编辑的档案名称。
- Base URL、API Key、记住 API Key、文字模型、图片模型和图片响应模式。
- 现有配置保存动作继续负责持久化档案和其他设置。

档案名称不能为空。删除当前档案后切换到剩余档案中的一个稳定档案。档案编辑和普通配置编辑遵循现有保存行为。

### Generation Pages

单图和批量页面顶部增加紧凑的当前档案选择器，只显示档案名称和响应模式，不显示 API Key。切换后：

- 单图、批量、AI 拆分和模型测试统一读取当前档案。
- 不清空提示词、批量子任务、参考图片或历史预览。
- 批量任务运行期间禁止切换档案，避免一个批次混用不同供应商。

当前档案切换应立即保存 `activeProviderProfileId`，并在页面刷新后保持。档案字段编辑仍沿用现有配置保存边界；切换前要保留当前内存草稿，不能悄悄把未保存的编辑写入另一个档案。

## Error Handling

当供应商返回图片 URL但浏览器无法下载时，错误区应明确说明：

> 当前供应商返回了图片 URL，但浏览器无法读取。请将当前供应商的“图片响应模式”切换为“强制 base64”，保存后再手动重试。本次调用可能已经产生费用，请勿连续重试。

提供“改为强制 base64”操作：

- 只修改当前档案的 `imageResponseMode`。
- 保存当前档案配置。
- 不自动重新调用图片模型。
- 用户自行确认后点击重试。

批量任务遇到同类错误时暂停剩余任务，并在批量状态区显示同样的操作建议。已经是 `force-base64` 仍返回 URL 时，提示供应商可能忽略该参数或仍不支持浏览器读取，不重复显示“切换 base64”建议。

错误信息不得包含完整供应商 URL、签名参数、API Key 或完整响应体。

## History And Batch Records

历史和批量记录可以保存非敏感的调用来源信息：

```text
providerProfileId
providerProfileName
imageModel
imageResponseMode
```

不得保存 API Key、Authorization 请求头、完整签名 URL 或完整私有响应体。旧历史记录没有档案信息时显示“历史记录中的旧配置”。

## Implementation Boundaries

- `src/core/config.ts` 负责档案类型、schema、迁移、校验和活动档案解析。
- Runtime adapter 负责档案配置及按档案 ID 隔离的 Key 存储。
- `src/core/apiClient.ts` 接收解析后的当前档案，不改变现有 `official` / `force-base64` 请求语义。
- `src/runtime/webAdapter.ts` 继续负责浏览器存储和敏感信息脱敏。
- `src/App.tsx` 负责设置页管理、单图/批量快速切换和错误操作入口。
- `src/i18n/translations.ts` 增加中英文档案和错误提示，页面不出现具体供应商名称。
- 公开静态 HTML 继续只使用用户自己的运行时配置，不内置维护者配置。

## Verification

### Automated

- 旧配置迁移为“默认供应商”且重复加载幂等。
- 不同档案的 URL、模型、响应模式和 Key 隔离。
- 删除档案会删除对应 Key，且不能删除最后一个档案。
- 单图和批量请求使用活动档案。
- CORS URL 错误产生 base64 建议，不自动重试。
- 批量 CORS 错误暂停后续任务。
- UI 可新增、编辑、删除和切换档案。
- 单图、批量、AI 拆分、历史、设置和移动端回归测试通过。
- 构建产物密钥扫描通过。

### Manual

1. 创建两个测试档案，分别填写不同 URL、模型和响应模式。
2. 在单图页切换档案并检查请求目标和请求体。
3. 在批量页切换档案并执行两个子任务。
4. 触发一次 URL 下载 CORS 失败，确认页面建议切换当前档案为强制 base64。
5. 点击建议按钮，确认没有自动再次调用。
6. 手动重试并确认请求模式变化。
7. 刷新页面，确认当前档案和 Key 记住策略保持。
8. 删除一个档案，确认其 Key 不再可用，且最后一个档案不能删除。
9. 扫描 HTML 和 Git 差异，确认没有真实 API Key、签名 URL 或私有配置。

## Acceptance Criteria

- 用户可以在设置页管理多个独立供应商档案。
- 单图和批量页面可以快速切换当前档案。
- 每个档案的 Key、URL、模型和响应模式不会串用。
- 旧版本配置升级后无需重新填写。
- Step Plan 等只返回 URL 或不支持浏览器读取的供应商，可以通过当前档案的强制 base64 模式使用；页面不绑定该供应商名称。
- CORS 失败不会触发自动重复计费调用。
- 公开静态产物不包含任何维护者密钥或供应商私有信息。
- 现有生图、批量、历史、设置和移动端流程不回归。
