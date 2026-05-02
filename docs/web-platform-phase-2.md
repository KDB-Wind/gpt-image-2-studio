# Web 平台 Phase 2 运行说明

Phase 2 的目标是跑通 Web 平台最小运行骨架：API 服务负责接收托管生图任务，Worker 负责执行任务，供应商熔断、API key 动态分配、健康探测和额度扣减策略复用共享核心包。

## 本地依赖

- Node.js `>= 20.19.0`
- npm `>= 10`
- Redis：后续真实队列运行需要
- PostgreSQL：后续真实数据持久化需要

Windows 本地开发时，新增下载和缓存必须放在 D 盘：

```powershell
$env:npm_config_cache = "D:\npm-cache"
```

## 启动命令

API 服务：

```powershell
npm run api:dev
```

Worker 服务：

```powershell
npm run worker:dev
```

当前 API 和 Worker 默认使用内存仓库，便于本地验证运行时逻辑。Redis、PostgreSQL、注册登录、支付和管理后台会在后续阶段接入。

## 默认保护参数

- 供应商熔断时长：5 分钟
- 平台托管总并发：建议默认 2
- 单个 API key 并发：建议默认 1
- 单次生图超时：建议默认 240 秒
- 健康探测：每次最多使用 1 个 API key

## 费用与额度规则

- 创建托管生图任务时只检查余额，不预扣额度。
- Worker 确认供应商成功返回图片后，才扣 1 个额度。
- `524`、`openai_error`、`bad_response_status_code`、无图片数据等成本风险失败不扣用户额度。
- 成本风险失败会打开供应商级熔断，因为 10 个平台 Key 共享同一个供应商，不能逐个 Key 重试消耗成本。

## 当前包结构

- `packages/platform-core`：供应商熔断、错误分类、API key 路由、健康探测和额度策略。
- `packages/platform-db`：仓储接口、数据库 schema 占位和内存仓库。
- `apps/api`：Fastify API 骨架。
- `apps/worker`：BullMQ Worker 入口和纯 job handler。

## 验证

```powershell
npm run platform:test
npm run test:run
npm run build
```

Phase 2 的测试不依赖真实 Redis、PostgreSQL 或图片模型调用。
