# Docker Web 平台验收指南

这份文档用于在没有本机 `psql` 的情况下验收 Web 平台版。Docker Compose 会启动 PostgreSQL、Redis、数据库迁移、API、Worker 和 Web 前端。

## 1. 准备配置

复制示例环境文件：

```powershell
cd D:\DemoProject\chatToImage
Copy-Item .env.local.platform.example .env.local.platform
```

编辑 `.env.local.platform`：

```text
PLATFORM_API_KEY=你的托管 API key
PLATFORM_ADMIN_TOKEN=local-admin-token
```

不要把 `.env.local.platform` 提交到 Git。

## 2. 本地启动

先确认 Docker Desktop 已经启动，并且 Docker Engine 可用：

```powershell
docker version
```

正常情况下输出里应同时有 `Client` 和 `Server` 两段。如果只看到 `Client`，或出现：

```text
failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine
```

说明 Docker Desktop 后台引擎没有运行。处理方式：

1. 从 Windows 开始菜单打开 Docker Desktop。
2. 等待 Docker Desktop 显示正在运行。
3. 重新执行 `docker version`。
4. 如果仍失败，用管理员 PowerShell 执行 `Start-Service com.docker.service`，再打开 Docker Desktop。

本错误发生在 Compose 读取配置和拉取镜像之前，不是项目代码、Compose 文件或 `node:22-alpine` 镜像的问题。

```powershell
cd D:\DemoProject\chatToImage
docker compose -f docker-compose.local.yml up --build
```

打开：

```text
http://localhost:5173
```

平台版的 API 地址留空。Docker 内部已把 Vite 的 `/api` 代理到 `http://api:3000`。

## 3. 验收要点

- 发送邮箱验证码时，本地不配置 SMTP，验证码会出现在 `api` 容器日志中。
- Worker 容器负责消费托管生图任务。
- 数据库迁移由 `migrate` 容器执行，不需要你本机安装 `psql`。
- 平台生成图片保存在 Docker volume `platform-outputs`，不是你的项目目录。
- 管理员 token 使用 `.env.local.platform` 中的 `PLATFORM_ADMIN_TOKEN`。

## 4. 查看日志

```powershell
docker compose -f docker-compose.local.yml logs -f api
docker compose -f docker-compose.local.yml logs -f worker
docker compose -f docker-compose.local.yml logs -f web
```

## 5. 停止与清理

停止服务但保留数据库数据：

```powershell
docker compose -f docker-compose.local.yml down
```

彻底删除数据库和输出 volume：

```powershell
docker compose -f docker-compose.local.yml down -v
```

## 6. 云服务器测试

如果在云服务器直接测试：

1. 安装 Docker 和 Docker Compose 插件。
2. 上传项目目录到服务器。
3. 创建 `.env.local.platform` 并填入托管 API key。
4. 执行 `docker compose -f docker-compose.local.yml up --build -d`。
5. 放行服务器安全组端口 `5173`。
6. 浏览器访问 `http://服务器IP:5173`。

这套 Compose 是验收环境，不是正式生产部署。正式上线应使用 Nginx、HTTPS、独立数据盘、备份、日志轮转和生产环境变量。
