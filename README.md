# GPT-Image-2 Studio

[简体中文](./README.md) | [English](./README.en.md)

轻量、本地优先的 `gpt-image-2` 调用工具，支持文生图、图生图、多图参考、历史记录和桌面打包。

## 作者推荐中转站

[https://ruoli.dev/register?aff=mR35](https://ruoli.dev/register?aff=mR35)

## 项目定位

这个公开仓库只包含基础独立工具版，适合个人本地使用或轻量分享。

不包含以下内容：

- 平台 API
- 队列 Worker
- 支付流程
- 用户注册与登录
- 托管 key 路由
- 平台级供应商熔断与后台管理

这些内容属于单独维护的私有平台代码，不在本仓库公开。

## 功能特性

- 默认中文界面，支持 `简体中文 / English` 切换
- 支持 `API key`、`Base URL`、文字模型、图片模型、超时时间、输出目录配置
- 支持文生图
- 支持图生图
- 支持最多 8 张参考图上传
- 支持多图拖拽上传
- 支持文字模型、文生图、图生图最小连通测试
- 支持本地历史记录与提示词复用
- 支持按日期保存图片到本地目录
- 支持 Tauri 桌面打包

## 默认配置

- `Base URL`: `https://ruoli.dev/v1`
- `Text model`: `gpt-5.4-mini`
- `Image model`: `gpt-image-2`
- `API key`: 默认留空
- `Timeout`: 最低建议 `180` 秒
- `Output directory`: `outputs`

## 安全说明

- `API key` 不会保存在仓库里。
- 本地配置保存到当前用户自己的设备。
- 真实 `.env` 文件已被忽略，不会被跟踪。
- 公开仓库使用的是从私有多产品仓库中导出的干净快照，避免带出不应公开的平台历史。

如果你曾在其他地方暴露过真实 `API key`，建议先轮换。

## 环境要求

- Node.js `>= 20.19.0`
- npm `>= 10`
- 如果需要构建 Tauri 桌面版，还需要 Rust toolchain

如果你希望 npm 缓存和下载落在 `D:`：

```powershell
$env:npm_config_cache = "D:\npm-cache"
npm install
```

## 开发与运行

安装依赖：

```powershell
$env:npm_config_cache = "D:\npm-cache"
npm install
```

启动 Web 版本：

```powershell
npm run dev
```

构建前端：

```powershell
npm run build
```

运行测试：

```powershell
npm run test:run
```

## 桌面版

桌面调试：

```powershell
npm run desktop:dev
```

构建桌面安装包：

```powershell
npm run desktop:build
```
