# Web 平台 Phase 2 运行说明

Phase 2 / Task 1-8 已完成 Web 平台后端 MVP 骨架：API 服务负责注册、额度、健康状态、提示词模板和托管生图任务入队；Worker 负责执行托管生图任务；共享包负责图片配置校验、Provider Adapter、供应商熔断、API key 路由、健康探测和扣费策略。

当前仓库也已经包含 Web 前端 MVP：平台版 / 基础工具版切换、邮箱验证码登录、服务状态、额度展示、提示词模板库、托管任务提交和任务历史。

## 当前已完成

- PostgreSQL / Drizzle schema、SQL migration 草案、Repository 接口和内存实现。
- Redis / BullMQ 队列适配器和 Worker 工厂。
- OpenAI-compatible 图片 Provider Adapter，支持文生图、图生图、多参考图、尺寸、质量、分辨率和超时配置。
- 邮箱验证码注册/登录服务骨架，默认开发环境会把验证码输出到控制台。
- 积分流水、每日免费额度、管理员加额度、成功后扣额度、失败不扣用户额度。
- 供应商健康探测：同一供应商模型每次只探测 1 个可用 key，不会把多个同供应商 key 全部测一遍。
- 供应商熔断：`524`、`openai_error`、`bad_response_status_code`、空图片响应、探测图片小于 500KB 等成本风险会打开供应商级熔断。
- 提示词模板共享包和 API 同步接口。
- Web 平台前端 MVP：`src/platform/PlatformApp.tsx`、`src/platform/platformClient.ts`、`src/platform/promptTools.ts`。
- 4C4G Linux 部署文档和容量估算。

## 仍未完成

- 真实 SMTP 发信服务和发送频率限制。
- 支付二维码提交、管理员审核、额度发放后台。
- 定时健康探测的 systemd timer / cron 运行链路。
- 数据库 migration 执行命令和生产部署脚本。
- 管理后台 UI。当前只有 token 保护的管理 API。

## 本地依赖

- Node.js `>= 20.19.0`
- npm `>= 10`
- Redis：真实 BullMQ 队列运行需要
- PostgreSQL：生产持久化需要

Windows 本地开发时，新增下载和缓存必须放在 D 盘：

```powershell
$env:npm_config_cache = "D:\npm-cache"
```

## 环境变量

开发环境不设置 `DATABASE_URL` 时会使用内存仓库，便于跑测试和轻量验证。生产环境 `NODE_ENV=production` 时必须配置 `DATABASE_URL`，否则 API / Worker 会拒绝启动。

```powershell
$env:DATABASE_URL = "postgres://chat_to_image:password@127.0.0.1:5432/chat_to_image"
$env:REDIS_URL = "redis://127.0.0.1:6379"
$env:PLATFORM_BASE_URL = "https://ruoli.dev/v1"
$env:PLATFORM_IMAGE_MODEL = "gpt-image-2"
$env:PLATFORM_API_KEYS = "sk-key-1,sk-key-2"
$env:PLATFORM_ADMIN_TOKEN = "change-me"
$env:GENERATION_JOB_TIMEOUT_MS = "240000"
$env:PLATFORM_OUTPUT_DIR = "D:\DemoProject\chatToImage\platform-outputs"
```

可以只配置一个托管 key：

```powershell
$env:PLATFORM_API_KEY = "sk-key-1"
```

也可以配置任意数量的 key：

```powershell
$env:PLATFORM_API_KEYS = "sk-key-1,sk-key-2,sk-key-3"
```

管理接口 `/api/admin/*` 必须携带 `x-admin-token` 或 `Authorization: Bearer <token>`，且服务端必须配置 `PLATFORM_ADMIN_TOKEN`。未配置时管理接口返回 `503`，token 错误时返回 `401`。

## 启动命令

API 服务：

```powershell
npm run api:dev
```

Worker 服务：

```powershell
npm run worker:dev
```

Web 前端：

```powershell
npm run dev
```

本地开发时，Vite 已把 `/api` 代理到 `http://localhost:3000`，所以平台版界面的 API 地址可以留空。生产部署时也建议让前端和 API 走同源 `/api`。

## 默认保护参数

- 供应商熔断时长：5 分钟
- 平台托管 Worker 并发：建议默认 1 到 2
- 单个 API key 并发：建议默认 1
- 单次生图超时：建议默认 240 秒
- 健康探测：每次最多使用 1 个 API key
- 健康图片阈值：小于 500KB 视为异常

## 费用与额度规则

- 创建托管生图任务前会确认用户存在且未禁用。
- 每日免费额度只在供应商可用且有可用托管 key 时发放。
- 创建托管任务时不预扣额度。
- Worker 确认供应商成功返回图片后，才扣 1 个额度。
- 成本风险失败不扣用户额度，但会打开供应商级熔断，避免继续消耗平台成本。

## 包结构

- `packages/platform-core`：供应商熔断、错误分类、API key 路由、健康探测和额度策略。
- `packages/platform-db`：Repository 接口、PostgreSQL schema、Drizzle 实现和内存仓库。
- `packages/image-config`：图片尺寸、质量、分辨率、超时、多图上传限制校验。
- `packages/provider`：OpenAI-compatible 图片 Provider Adapter。
- `packages/prompt-templates`：提示词模板目录、分类和变量渲染。
- `apps/api`：Fastify API。
- `apps/worker`：BullMQ Worker 和托管生图任务处理。

## 验证

```powershell
npm run platform:test
npm run test:run
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

当前测试不依赖真实 Redis、PostgreSQL 或图片模型调用。
