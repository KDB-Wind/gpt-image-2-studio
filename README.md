# Chat To Image

本项目当前包含两个方向：

- 本地桌面版：面向个人本机使用，配置和图片优先保存在当前用户本机。
- Web 平台版：正在分阶段开发，目标是让普通用户通过网页注册、体验和付费使用平台托管的生图能力。

## 本地桌面版

桌面版已经具备基础可用能力：

- 输入提示词生成图片。
- 支持上传图片加文字进行图生图。
- 支持多图上传和拖拽上传。
- 可配置 `API key`、`Base URL`、文字模型、图片模型、超时时间和输出目录。
- 生成图片按日期保存到本地目录。
- 支持 Windows 安装包分发。

普通用户优先使用 Windows 安装包，不建议把 `npm run dev` 作为主要使用方式。

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

Web 平台正在分阶段实现：

- Phase 1：供应商熔断、API key 动态分配、健康探测和额度策略核心。
- Phase 2：API 与 Worker 最小运行骨架、托管生图任务入队、成功后扣额度、成本风险失败不扣用户额度。
- 后续阶段：邮箱注册、提示词模板、手动支付、管理员后台、部署脚本和监控面板。

当前 Phase 2 仍是运行时骨架，不是完整生产平台。它已经包含供应商熔断保护：如果同一供应商的图片模型出现 `524`、`openai_error`、空图片响应等高成本风险失败，会暂停平台托管调用，避免 10 个同供应商 API key 被重复消耗。

更多运行说明见 [docs/web-platform-phase-2.md](docs/web-platform-phase-2.md)。

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
