# Chat To Image

本项目当前保留两个方向：

- 基础工具版：面向个人本机使用，配置和图片优先保存在当前用户本机，后续可作为轻量开源版本发布。
- Web 平台版：面向普通网页用户，支持注册、额度、队列、供应商熔断、健康探测、提示词模板和平台托管 Key 模式。

## 基础工具版

基础工具版已经具备可用能力：

- 输入提示词生成图片。
- 支持上传图片加文字进行图生图。
- 支持多图上传和拖拽上传。
- 可配置 `API key`、`Base URL`、文字模型、图片模型、超时时间和输出目录。
- 生成图片按日期保存到本地目录。
- 支持 Windows 安装包分发。

基础工具版不包含用户管理、积分、支付、平台托管 Key、队列和平台图片存储。普通用户优先使用 Windows 安装包，不建议把 `npm run dev` 作为主要使用方式。

## 默认配置

- `Base URL`: `https://ruoli.dev/v1`
- `Text model`: `gpt-5.4-mini`
- `Image model`: `gpt-image-2`
- `API key`: 默认留空，由用户自行填写
- `Timeout`: 建议不少于 `240` 秒
- `Output directory`: 默认本地输出目录

## 开发环境

- Node.js `>= 20.19.0`
- npm `>= 10`
- Desktop / Tauri 开发还需要 Rust 工具链

安装依赖前，如果有新增下载或缓存，请固定到 D 盘：

```powershell
$env:npm_config_cache = "D:\npm-cache"
npm install
```

## 常用命令

本地前端开发：

```powershell
npm run dev
```

桌面版开发：

```powershell
npm run desktop:dev
```

桌面版打包：

```powershell
npm run desktop:build
```

Web 平台 API 开发：

```powershell
npm run api:dev
```

Web 平台 Worker 开发：

```powershell
npm run worker:dev
```

## Web 平台开发状态

Web 平台后端 Task 1-8 已完成并合并到 `master`：

- Phase 1：供应商熔断、API key 动态分配、健康探测和额度策略核心。
- Task 1-8：PostgreSQL/Drizzle 持久化、Redis/BullMQ 队列、Provider Adapter、邮箱验证码注册骨架、积分系统、健康监控、提示词模板库、4C4G Linux 部署文档。
- Web 前端 MVP：平台版 / 基础工具版切换、邮箱验证码登录、服务状态、额度展示、提示词模板库、托管任务提交和任务历史。

当前代码已经包含供应商熔断保护：如果同一供应商的图片模型出现 `524`、`openai_error`、空图片响应等高成本风险失败，会暂停平台托管调用，避免多个同供应商 API key 被重复消耗。托管任务只会在供应商成功返回图片后扣用户额度。

Web 平台仍不是完整生产产品。下一阶段重点是真实 SMTP、支付审核后台、定时健康探测运行链路、部署脚本和管理后台 UI。

更多说明见：

- [docs/web-platform-phase-2.md](docs/web-platform-phase-2.md)
- [docs/product-editions.md](docs/product-editions.md)
- [docs/deployment/4c4g-linux-platform.md](docs/deployment/4c4g-linux-platform.md)

## 验证命令

```powershell
npm run platform:test
npm run test:run
npm run build
```

Tauri / Rust 侧验证：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

## 安全说明

- 仓库默认不包含真实 `API key`。
- 每个用户都应该在自己的本地环境中填写并保存 `API key`。
- 不要把包含真实密钥的配置文件提交到 Git。
- Web 平台托管 Key 模式必须由后端保管平台 Key，不能下发到浏览器。
