# 双产品 Web 生图平台设计

Date: 2026-05-02

## 背景

当前项目已经具备本地桌面生图工具能力，并已经抽取出 Web 平台 Phase 2 的部分运行骨架：

- `packages/platform-core`：供应商熔断、API key 路由、错误分类、健康探测、额度策略。
- `packages/platform-db`：仓储接口、schema 占位、内存仓储。
- `apps/api`：Fastify API 骨架。
- `apps/worker`：BullMQ worker 入口和纯 job handler。

下一阶段不应只做一个托管平台。项目需要同时保留一个无用户管理、可开源、轻量自用的基础工具版，避免把注册、支付、额度、管理员后台等平台业务耦合进所有生图能力。

## 目标

本设计将项目拆成两个产品线和一组共享核心能力：

- 基础工具版：面向 GitHub 开源和轻量自部署，用户自行配置 `Base URL`、`API key`、模型名和生成参数。
- 托管平台版：面向普通小白用户，支持注册、每日免费额度、平台托管 Key、队列生成、额度扣减、手动支付、管理员后台、服务健康监控。
- 共享核心包：为两个产品线复用 provider adapter、图片参数、提示词模板、错误分类、供应商熔断和生成参数校验。

成功标准是：基础工具版可以独立开源，不包含任何平台托管 Key、用户系统、支付系统或后台管理；托管平台版可以复用同一套生图核心能力，并逐步接入数据库、Redis、队列、账号、额度和监控。

## 非目标

- 本阶段不做完整微信支付自动回调。
- 本阶段不做多供应商自动切换。
- 本阶段不做移动 App。
- 本阶段不做长期云盘式图片存储。
- 本阶段不把平台托管 Key 暴露给浏览器。
- 本阶段不把用户自有 `API key` 持久化到平台数据库。

## 产品拆分

### 基础工具版

基础工具版是后续开源版本，定位是“用户自己的轻量生图工具”。

包含能力：

- 文生图。
- 图生图。
- 最多 8 张参考图上传，推荐不超过 4 张。
- 文件选择和拖拽上传。
- 提示词模板库。
- 图片模型尺寸、质量、分辨率等参数选择。
- 用户自填 `Base URL`、`API key`、文字模型和图片模型。
- 配置保存在浏览器本地或本机环境。
- 生成结果由用户下载或保存在本地。

不包含能力：

- 注册和登录。
- 平台托管 Key。
- 用户额度。
- 支付。
- 管理员后台。
- 平台服务健康状态。
- 平台侧图片长期存储。

基础工具版默认不依赖服务器。浏览器直连供应商时，如果供应商或中转站不支持 CORS，则用户可以选择本地运行版本或未来的可选本地代理，但开源基础版不应默认把用户 Key 发到项目作者服务器。

### 托管平台版

托管平台版是作者维护的网站，定位是“普通用户不用理解 API key 也能生图”。

包含能力：

- 邮箱验证码注册和登录。
- 每日免费体验额度。
- 平台托管 Key 池。
- 10 个同供应商 API key 的动态分配。
- PostgreSQL 持久化。
- Redis + BullMQ 队列。
- Worker 执行真实图片生成。
- 供应商级熔断保护。
- 成功后扣额度，成本风险失败不扣额度。
- 手动微信二维码充值。
- 管理员手动加额度。
- 管理员查看任务、用户、额度、供应商状态和 Key 状态。
- 服务健康状态展示。
- 提示词模板库。

托管平台版必须把平台 API key 只保存在服务端。前端永远不能接收完整平台 Key。

### 共享核心

共享核心为两个产品线服务，不能依赖平台专属模块。

共享包职责：

- OpenAI-compatible provider adapter。
- 图片生成请求和响应解析。
- 多图输入标准化。
- 尺寸、质量、分辨率、超时、上传上限等图片配置。
- 供应商错误分类。
- 供应商熔断策略。
- API key 路由评分算法。
- 健康探测策略。
- 提示词模板数据结构和变量填充。
- 生成参数校验。

共享核心不能依赖：

- 用户表。
- 额度表。
- 支付表。
- 管理员后台。
- 平台 Web session。
- 平台专属数据库实现。

## 推荐代码结构

```text
apps/
  basic-web/       基础工具版，后续开源入口
  platform-web/    托管平台前台
  api/             平台后端 API
  worker/          平台队列 worker

packages/
  platform-core/      已有：熔断、路由、错误分类、健康探测、额度策略
  platform-db/        已有：仓储接口和数据库抽象
  provider/           新增：OpenAI-compatible 图片模型调用适配器
  prompt-templates/   新增：提示词模板库
  image-config/       新增：图片模型参数、上传限制、默认值
```

当前根目录 `src/` 和 Tauri 桌面版本可以继续保留。后续可以逐步把可复用 UI 和生图逻辑迁移到 `apps/basic-web` 与共享包，不需要一次性重写。

## 依赖边界

允许的依赖方向：

```text
apps/basic-web -> packages/provider
apps/basic-web -> packages/prompt-templates
apps/basic-web -> packages/image-config
apps/basic-web -> packages/platform-core 的纯函数能力

apps/platform-web -> packages/prompt-templates
apps/platform-web -> packages/image-config
apps/platform-web -> apps/api

apps/api -> packages/platform-core
apps/api -> packages/platform-db
apps/api -> packages/prompt-templates
apps/api -> packages/image-config

apps/worker -> packages/platform-core
apps/worker -> packages/platform-db
apps/worker -> packages/provider
apps/worker -> packages/image-config
```

禁止的依赖方向：

```text
apps/basic-web -> apps/api
apps/basic-web -> apps/worker
apps/basic-web -> packages/platform-db
apps/basic-web -> 用户、额度、支付、管理员模块
packages/provider -> apps/*
packages/prompt-templates -> apps/*
packages/image-config -> apps/*
```

如果基础工具版需要在网页上使用用户自有 Key，优先采用浏览器本地保存和浏览器直连。若必须经过临时代理，代理必须不持久化用户 Key，并且要有明确的频率限制和成本说明。

## 关键数据流

### 基础工具版数据流

```text
用户配置 Base URL/API key/model
  -> 浏览器本地保存配置
  -> 选择提示词模板或手写提示词
  -> 选择图片参数和参考图
  -> provider adapter 构造请求
  -> 供应商返回图片
  -> 浏览器展示和下载
  -> 历史记录保存在浏览器本地
```

基础工具版不产生平台费用，不消耗平台额度，不占用平台图片存储。

### 托管平台版数据流

```text
用户登录
  -> API 检查额度、输入参数和供应商状态
  -> 创建 generation job
  -> job 进入 Redis/BullMQ
  -> worker 选择可用平台 API key
  -> worker 调用 provider adapter
  -> 成功后保存图片和任务结果
  -> 成功后扣用户额度
  -> 前端轮询或订阅任务状态
```

高成本风险失败时，worker 不扣用户额度，但记录平台成本风险事件，并打开供应商级熔断。

## 供应商熔断规则

10 个平台 API key 属于同一个 `Base URL`，因此熔断维度必须是供应商模型，而不是单个 Key。

供应商模型标识：

```text
providerModelKey = Base URL + imageModel
```

默认规则：

- 任意一个 Key 出现高成本风险失败，立即打开该供应商模型的熔断。
- 熔断打开后，普通用户不能继续发起平台托管 Key 生图。
- 熔断打开后，不再依次测试其余 9 个 Key，避免 10 倍成本损耗。
- 定时健康探测每次最多使用 1 个 Key。
- 熔断到期后进入 half-open，只允许 1 次探测。
- 探测成功后关闭熔断。
- 探测失败后重新打开熔断。

高成本风险失败包括：

- HTTP `524`。
- `openai_error`。
- `bad_response_status_code`。
- 响应没有任何图片数据。
- 返回 200 但 payload 是结构化错误。
- 供应商调用可能已经计费但无法生成可用图片的异常。

默认熔断时间为 5 分钟。后续管理员可以配置熔断时间、健康探测间隔、白天和夜间探测频率。

## API key 动态分配

Key 分配只在供应商状态健康时执行。

每个 Key 维护以下运行状态：

```text
enabled
state: healthy | cooldown | disabled
cooldownUntil
inFlight
maxInFlight
success15m
fail15m
costRiskFail15m
rateLimit15m
success1h
fail1h
consecutiveFailures
consecutiveCostRiskFailures
ewmaLatencyMs
lastUsedAt
```

选择流程：

```text
检查 providerModel 是否熔断
  -> 过滤禁用、冷却中、并发已满的 Key
  -> 按成功率、延迟、429 次数、当前并发、最近使用时间评分
  -> 加权随机选择一个 Key
  -> 记录 selectedApiKeyId
  -> 调用结束后更新 Key 和 providerModel 状态
```

高成本风险失败会同时冷却当前 Key 并打开供应商级熔断。429 只冷却当前 Key，不打开供应商级熔断。

## 持久化设计方向

Task 1 使用 PostgreSQL + Drizzle 作为平台持久化基础。

核心表：

```text
users
email_verification_codes
sessions
prompt_templates
provider_models
provider_api_keys
provider_model_health_events
generation_jobs
generation_results
user_credit_accounts
credit_ledger
payments
admin_audit_logs
app_settings
```

基础工具版不依赖这些表。提示词模板可以从共享包静态加载；托管平台版可以将模板同步进数据库，由管理员启用、禁用和编辑。

## 队列设计方向

Task 2 使用 Redis + BullMQ。

队列职责：

- 平台托管 Key 的生图任务必须入队。
- 单用户同一时间默认只允许 1 个运行或排队任务。
- 平台总生图并发默认 2。
- 单 Key 并发默认 1。
- 单任务超时默认 240 秒，管理员可配置。
- 高成本风险失败不自动换 Key 重试。

队列不服务基础工具版。基础工具版直接由用户本地环境调用供应商。

## 提示词模板库

提示词模板库应作为共享包提前设计，供基础工具版和托管平台版共同使用。

模板结构：

```ts
type PromptTemplate = {
  id: string;
  category: "portrait" | "graduation" | "product" | "poster" | "avatar" | "scene";
  title: string;
  description: string;
  prompt: string;
  variables: Array<{
    key: string;
    label: string;
    placeholder: string;
    required: boolean;
  }>;
  sourceUrl?: string;
  license?: string;
  enabled: boolean;
};
```

模板来源策略：

- 可以参考 GitHub 上的开源提示词，但必须记录来源链接和许可证。
- 没有明确许可证的内容不能批量复制进项目。
- 推荐人工改写成自有模板，避免直接复制受限内容。
- 第一版优先做精选模板，不做海量自动抓取。

## 平台用户、额度与支付

用户系统只属于托管平台版。

第一版用户系统：

- 邮箱验证码注册和登录。
- 同 IP 验证码发送限流。
- 同邮箱验证码发送限流。
- 验证码 10 分钟有效。
- 验证码错误多次后短期锁定。
- 可选接入 Turnstile 或 hCaptcha。

第一版额度系统：

- 新用户每日 1 张免费体验额度。
- 成功生成后扣额度。
- 用户输入错误、供应商熔断、供应商高成本风险失败不扣额度。
- 管理员可以手动加额度。
- 额度使用账本记录，不只存一个余额数字。

第一版支付系统：

- 使用固定金额充值，例如 5 元、10 元。
- 展示微信收款码。
- 用户提交付款备注或截图。
- 管理员人工确认后加额度。
- 不做自动到账回调。

## 健康监控

健康监控只属于托管平台版。

前台状态：

```text
正常
排队较多
供应商异常，暂停生成
维护中
```

管理员配置：

- 白天开始时间和结束时间。
- 白天探测间隔。
- 夜间探测间隔。
- 熔断时长。
- 是否启用自动探测恢复。
- 健康图片最小文件大小阈值，默认 500KB。

健康探测每次最多使用 1 个 Key。供应商已熔断时，不连续探测所有 Key。

## 部署设计

目标服务器按 4 核 4G 轻量应用服务器估算，但本项目只按约 50% 资源预算设计，即 2 核 2G。

推荐部署组成：

```text
Nginx
platform-web 静态资源
api 服务
worker 服务
PostgreSQL
Redis
本地图片存储目录
```

早期容量建议：

- 平台托管生图总并发：2。
- 单 Key 并发：1。
- API 服务实例：1。
- Worker 实例：1。
- 图片保留期：默认 7 天。

如果单张图片生成耗时 120 秒，总并发 2，则理论上约 60 张/小时。真实可承载用户量取决于活跃用户同时点击生成的比例，而不是注册用户总数。

基础工具版可以作为静态站点或本地项目独立发布，不需要 PostgreSQL、Redis、API 或 Worker。

## Task 1-8 执行顺序

### Task 1: PostgreSQL/Drizzle 持久化

目标是把 `packages/platform-db` 从内存仓储推进到真实数据库 schema、迁移和 repository 实现。

验收标准：

- schema 覆盖用户、验证码、供应商、Key、任务、结果、额度账本、支付、管理员审计和设置。
- 现有内存 repository 测试继续保留。
- 新增 Drizzle repository 测试。

### Task 2: Redis/BullMQ 队列

目标是让 `apps/api` 创建真实队列任务，`apps/worker` 消费真实 BullMQ job。

验收标准：

- API 可以创建 queued job。
- Worker 可以消费 job 并更新状态。
- 队列并发、任务超时和失败状态可配置。

### Task 3: 真实 provider adapter 与熔断接入

目标是把真实 OpenAI-compatible 图片模型调用封装到 `packages/provider`，并接入 worker。

验收标准：

- 支持文生图、图生图、多图输入。
- 支持图片尺寸、质量、分辨率参数。
- 响应无图片数据被归类为高成本风险失败。
- 高成本风险失败触发供应商级熔断。
- 熔断后不会测试其余 9 个同供应商 Key。

### Task 4: 用户系统

目标是实现邮箱验证码注册和登录。

验收标准：

- 用户可以通过邮箱验证码登录。
- 验证码发送、验证和错误次数有限流。
- 管理员可以禁用用户。

### Task 5: 额度系统

目标是实现每日免费额度、成功扣费、失败不扣费和管理员加额度。

验收标准：

- 新用户每日获得 1 张免费体验额度。
- 成功生成才扣额度。
- 高成本风险失败不扣额度。
- 额度账本可追溯。

### Task 6: 服务健康监控

目标是实现供应商健康探测和前台状态展示。

验收标准：

- 定时探测每次最多使用 1 个 Key。
- 管理员可配置探测间隔和熔断时长。
- 前台展示当前服务状态。

### Task 7: 提示词模板库

目标是建立共享模板包，并让基础工具版和托管平台版都能使用。

验收标准：

- 模板包含分类、标题、描述、完整提示词和变量。
- 模板记录来源和许可证。
- 基础工具版可以静态使用模板。
- 托管平台版可以将模板同步进数据库并由管理员管理。

### Task 8: 部署方案

目标是把平台部署到 4 核 4G Linux 服务器，并按 2 核 2G 预算控制资源。

验收标准：

- 文档包含 Nginx、API、Worker、PostgreSQL、Redis、图片目录配置。
- 文档包含环境变量和密钥管理说明。
- 文档包含备份、日志、健康检查和重启策略。

## 风险与决策

### CORS 风险

基础工具版浏览器直连供应商可能遇到 CORS 限制。默认处理是允许本地运行或未来提供可选本地代理，而不是默认走作者服务器代理。

### 编码风险

当前部分 README 和 docs 在读取时出现中文乱码。后续文档任务需要统一按 UTF-8 重写或修复，避免普通用户看到乱码。

### 成本风险

供应商 `524`、`openai_error`、无图片数据等错误可能已经产生调用费用。托管平台版必须默认保守：一次高成本风险失败即可供应商级熔断。

### 开源边界风险

基础工具版后续要开源，因此不能包含真实平台 Key、支付逻辑、用户数据库、管理员接口或任何平台运营密钥。

## 验收清单

- 基础工具版与托管平台版边界明确。
- 基础工具版不依赖 `apps/api`、`apps/worker` 或 `packages/platform-db`。
- 托管平台版可以复用共享 provider、模板、图片参数和熔断能力。
- 供应商熔断以 `Base URL + imageModel` 为维度。
- 同供应商 10 个 Key 不会在高成本风险失败后被逐个重试。
- Task 1-8 的执行顺序明确。
- 后续 implementation plan 可以按 Task 1 开始逐步实施。
