# GPT-Image-2 Studio

[简体中文](./README.md) | [English](./README.en.md)

[![CI](https://github.com/KDB-Wind/gpt-image-2-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/KDB-Wind/gpt-image-2-studio/actions/workflows/ci.yml)
[![Release](https://github.com/KDB-Wind/gpt-image-2-studio/actions/workflows/release.yml/badge.svg)](https://github.com/KDB-Wind/gpt-image-2-studio/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

轻量、本地优先的 `gpt-image-2` 调用工具，支持文生图、图生图、多图参考、提示词模板、历史记录和 Windows 桌面安装包。

![GPT-Image-2 Studio 明亮界面预览](./docs/assets/app-preview.svg)

## 普通用户安装

普通用户不需要安装 Node.js、npm 或 Rust。

1. 打开 [Releases](https://github.com/KDB-Wind/gpt-image-2-studio/releases)。
2. 下载最新版本里的 `setup.exe`。
3. 安装并打开应用。
4. 在设置页填写自己的 `API key`、`Base URL`、文字模型、图片模型和输出目录。
5. 保存配置后开始生成图片。

如果 Windows 提示 SmartScreen 风险，这是因为开源项目首版暂未做代码签名。请只从本仓库 Release 页面下载安装包。

## 作者推荐中转站

如果你需要 OpenAI compatible 的中转服务，可以参考作者推荐链接：

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

- 默认中文界面，支持 `简体中文 / English` 切换。
- 支持 `API key`、`Base URL`、文字模型、图片模型、超时时间、输出目录配置。
- 支持文生图和图生图。
- 支持最多 8 张参考图上传，推荐不超过 4 张。
- 支持多图拖拽上传。
- 支持图片尺寸、质量、格式和压缩参数选择。
- 支持文字模型、文生图、图生图最小连通测试。
- 支持本地提示词模板和自定义模板。
- 支持本地历史记录、搜索、过滤和批量删除。
- 支持按日期保存图片到本地目录。
- 支持 Tauri Windows 桌面打包。

## 默认配置

- `Base URL`: `https://ruoli.dev/v1`
- `Text model`: `gpt-5.4-mini`
- `Image model`: `gpt-image-2`
- `API key`: 默认留空
- `Timeout`: 最低建议 `180` 秒
- `Output directory`: `outputs`

## 安全说明

- `API key` 不会保存在仓库里。
- Web 版本的配置保存在浏览器本地存储中。
- 桌面版本会优先使用系统级安全存储，失败时才回退到本地配置文件。
- 真实 `.env` 文件已被忽略，不会被跟踪。
- 公开仓库使用的是从私有多产品仓库中导出的干净快照，避免带出不应公开的平台历史。

如果你曾在其他地方暴露过真实 `API key`，建议先轮换。

## 开发者本地运行

环境要求：

- Node.js `>= 20.19.0`
- npm `>= 10`
- 如果需要构建 Tauri 桌面版，还需要 Rust toolchain

安装依赖：

```powershell
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

如果你希望 npm 缓存和下载落在 `D:`：

```powershell
$env:npm_config_cache = "D:\npm-cache"
npm install
```

## 桌面版开发

桌面调试：

```powershell
npm run desktop:dev
```

构建桌面安装包：

```powershell
npm run desktop:build
```

## 发布安装包

本仓库已经配置 GitHub Actions Release 链路。推送 `v*.*.*` tag 后，会在 Windows runner 上构建 Tauri 安装包，并创建草稿 GitHub Release。

普通用户优先下载 `setup.exe`。源码运行方式只推荐开发者使用。

发布前本地检查：

```powershell
npm run release:check
```

完整说明见 [docs/release.md](./docs/release.md)，当前 Release 文案见 [docs/release-notes/v0.1.1.md](./docs/release-notes/v0.1.1.md)，人工验收清单见 [docs/release-checklist.md](./docs/release-checklist.md)。

## 贡献与反馈

- 提交问题前请先阅读 [FAQ](./docs/faq.md)。
- 贡献代码请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。
- 安全问题请阅读 [SECURITY.md](./SECURITY.md)。

## 后续路线图

后续优化事项记录在 [docs/roadmap.md](./docs/roadmap.md)。
