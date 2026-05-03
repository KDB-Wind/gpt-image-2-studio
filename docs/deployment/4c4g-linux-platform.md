# 4C4G Linux 网页平台部署方案

本文档面向“托管 API Key + 用户自带 API Key”双模式网页平台。目标机器是一台 4 核 4G 轻量应用服务器，其中约 50% 资源预留给本项目，即按 2 核 2G 的实际预算做容量规划。

## 1. 部署目标

- 对普通用户提供网页入口，避免要求用户安装 Windows 客户端或运行 npm 命令。
- 平台托管 Key 模式由服务端统一调度 API Key、积分、熔断、健康检查和生成队列。
- 用户自带 Key 模式只在浏览器本地保存用户自己的 Base URL / API key / 模型名，不占用平台图片存储。
- 图片生成任务必须走队列，API 进程只负责鉴权、扣额度前置校验、入队和状态查询。
- 供应商异常时要进入熔断状态，避免同一供应商下 10 个 API Key 被重复试错而产生 10 倍成本。

## 2. 推荐组件

- Nginx：HTTPS 终止、静态文件服务、反向代理 API。
- Node.js 20 LTS：运行 API 与 Worker。
- PostgreSQL 16：保存用户、积分、订单、模板、供应商状态、任务和审计日志。
- Redis 7：BullMQ 队列和任务状态缓存。
- 本地磁盘目录：保存平台托管模式生成的图片结果。
- systemd：管理 API、Worker、健康检查定时器和重启策略。

## 3. 目录建议

```text
/opt/chat-to-image/
  app/                 # 构建后的应用代码
  releases/            # 历史版本
  shared/
    images/            # 平台托管模式生成图片
    logs/              # API / Worker 日志
    backups/           # 数据库与图片备份
    env/production.env # 生产环境变量，仅 root / deploy 可读
```

图片目录建议挂载到独立数据盘或云盘，避免系统盘爆满导致服务不可用。

## 4. 环境变量

```bash
NODE_ENV=production
PORT=3000
PUBLIC_WEB_ORIGIN=https://your-domain.com

DATABASE_URL=postgres://chat_to_image:***@127.0.0.1:5432/chat_to_image
REDIS_URL=redis://127.0.0.1:6379

PLATFORM_PROVIDER_ID=ruoli
PLATFORM_BASE_URL=https://ruoli.dev/v1
PLATFORM_IMAGE_MODEL=gpt-image-2
PLATFORM_API_KEYS=sk-key-1,sk-key-2
PLATFORM_API_KEY_MAX_IN_FLIGHT=1
GENERATION_JOB_TIMEOUT_MS=240000
GENERATION_WORKER_CONCURRENCY=2

PLATFORM_OUTPUT_DIR=/opt/chat-to-image/shared/images
PROVIDER_CIRCUIT_COOLDOWN_MS=300000
HEALTH_DAY_INTERVAL_MINUTES=30
HEALTH_NIGHT_INTERVAL_MINUTES=60

EMAIL_SMTP_HOST=smtp.example.com
EMAIL_SMTP_PORT=465
EMAIL_SMTP_USER=notice@example.com
EMAIL_SMTP_PASSWORD=***

SESSION_SECRET=***
API_KEY_ENCRYPTION_SECRET=***
PLATFORM_ADMIN_TOKEN=***
ADMIN_BOOTSTRAP_EMAIL=admin@example.com
```

生产环境不要把真实 API Key 写进 Git 仓库。10 个托管 API Key 应加密后写入数据库，运行时通过 `API_KEY_ENCRYPTION_SECRET` 解密使用。

## 5. Nginx 配置草案

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    client_max_body_size 40m;

    location / {
        root /opt/chat-to-image/app/dist;
        try_files $uri /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

图生图最多 8 张参考图，建议 Nginx 上传上限先设为 40MB。后续如果要支持更大图片，应配合前端压缩和服务端文件大小校验。

## 6. systemd 服务

API 服务：

```ini
[Unit]
Description=Chat To Image API
After=network.target postgresql.service redis-server.service

[Service]
WorkingDirectory=/opt/chat-to-image/app
EnvironmentFile=/opt/chat-to-image/shared/env/production.env
ExecStart=/usr/bin/node apps/api/dist/server.js
Restart=always
RestartSec=5
User=deploy
Group=deploy
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

Worker 服务：

```ini
[Unit]
Description=Chat To Image Worker
After=network.target redis-server.service

[Service]
WorkingDirectory=/opt/chat-to-image/app
EnvironmentFile=/opt/chat-to-image/shared/env/production.env
ExecStart=/usr/bin/node apps/worker/dist/worker.js
Restart=always
RestartSec=5
User=deploy
Group=deploy
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

当前仓库仍处在 MVP 后端基础阶段，`apps/api/src/server.ts` 默认使用内存仓库。正式部署前必须把 API 和 Worker 切换到 PostgreSQL/Drizzle 仓库实现，否则进程重启会丢失用户、积分、任务与健康状态。

## 7. 健康检查与熔断

- 每个供应商模型只用一个可用 API Key 做探测，不对同一个供应商下的 10 个 Key 逐个测试。
- 白天默认每 30 分钟探测一次，夜间默认每 60 分钟探测一次，管理员可调整。
- 探测图片小于 500KB 或无图片数据时，判定为供应商异常。
- 对 524、`openai_error`、`bad_response_status_code`、空图片响应等可能产生费用但无结果的错误，进入供应商级熔断。
- 熔断期内普通用户不能继续调用托管模式；管理员探测可以绕过，用于手动恢复验证。
- 用户自带 Key 模式可以给出风险提示，但不应占用平台积分和图片存储。

## 8. 容量估算

以 2 核 2G 项目预算估算：

- API 并发：100 到 300 个轻量请求并发通常可承受，瓶颈主要在数据库连接数和上传图片大小。
- Worker 并发：建议从 1 到 2 开始。单张图耗时约 120 到 130 秒，`concurrency=2` 时理论吞吐约 55 到 60 张/小时。
- 托管模式日生成量：如果免费体验每天 1 张，1000 个新用户会触发约 100 元供应商成本，应通过注册风控、邮箱验证、IP 限制和熔断保护控制风险。
- 用户自带 Key 模式：服务器主要承载网页与少量代理/状态请求，若图片不经服务器存储，资源压力远低于托管模式。
- 存储：按每张图 1MB 到 5MB 估算，1 万张图片约 10GB 到 50GB。必须配置定期清理或对象存储迁移策略。

如果托管模式开始有稳定付费用户，建议单独升级 Worker 机器或把 Redis/PostgreSQL 拆到托管云服务，避免一台 4C4G 同时承载数据库、队列、API、Worker、Nginx 和其他项目。

## 9. 注册与风控

- 邮箱验证码注册，验证码 10 分钟有效，错误次数达到阈值后锁定当前验证码。
- 同一 IP、同一邮箱、同一设备指纹应配置注册和验证码发送频率限制。
- 新用户每日免费 1 张体验图，体验失败不扣额度，但供应商成本风险由健康检查和熔断控制。
- 后续付费用户通过固定金额充值获得额度，管理员可人工审核二维码付款并发放额度。
- 管理员操作必须写入审计日志，包括禁用用户、加额度、审核支付和修改供应商配置。

## 10. 备份策略

- PostgreSQL：每天全量备份，保留 7 到 14 天；重要发布前手动备份。
- 图片目录：每天增量备份，至少保留最近 7 天。
- 环境变量和密钥：不进入普通备份包，单独用密码管理器或加密介质保存。
- 恢复演练：每月至少一次在临时目录恢复数据库和少量图片，验证备份可用。

## 11. 日志与告警

- API 日志记录请求 ID、用户 ID、路由、状态码、耗时，不记录明文 API Key。
- Worker 日志记录 jobId、providerModelId、apiKeyId、耗时、失败分类和熔断状态。
- 健康检查日志记录探测状态、图片大小、延迟和失败原因。
- 告警优先级：供应商熔断、Redis 不可用、PostgreSQL 不可用、磁盘使用率超过 80%、Worker 连续失败。

## 12. 发布流程

1. 在本地或 CI 跑 `npm run platform:test`、`npm run test:run`、`npm run build`。
2. 打包前端和 Node 服务产物，上传到 `/opt/chat-to-image/releases/<version>`。
3. 更新 `app` 软链接指向新版本。
4. 执行数据库迁移。
5. 重启 API 和 Worker。
6. 调用健康检查接口确认供应商状态。
7. 如失败，回滚 `app` 软链接并重启服务。

## 13. 基础开源版保留策略

基础工具版不包含用户管理、积分、支付、托管 Key、队列和平台存储。它应继续支持：

- 用户本地配置 Base URL / API key / 模型名。
- 文生图、图生图、多图参考和拖拽上传。
- 本地保存图片。
- 本地轻量运行或静态页面模式。

网页平台版和基础工具版应共享图片配置、供应商适配器、提示词模板等中立包，避免重复维护核心调用逻辑。
