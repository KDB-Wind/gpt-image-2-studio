# GPT-Image-2 Studio

简体中文为主文档语言。English is available as a secondary guide: [README.en.md](./README.en.md).

[![CI](https://github.com/KDB-Wind/gpt-image-2-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/KDB-Wind/gpt-image-2-studio/actions/workflows/ci.yml)
[![Release](https://github.com/KDB-Wind/gpt-image-2-studio/actions/workflows/release.yml/badge.svg)](https://github.com/KDB-Wind/gpt-image-2-studio/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

GPT-Image-2 Studio 是一个轻量、本地优先的 `gpt-image-2` 调用工具。你填写自己的 `API key`、`Base URL`、文字模型和图片模型后，可以进行文生图、图生图、多图参考和批量生图。

![GPT-Image-2 Studio bright UI preview](./docs/assets/app-preview.svg)

## 最快使用：单文件 HTML

普通用户不需要安装 Node.js，也不需要运行 `npm run dev`。

1. 打开 [GitHub Releases](https://github.com/KDB-Wind/gpt-image-2-studio/releases)。
2. 下载最新 Release 附件里的 `gpt-image-2-studio-lite.html`。
3. 双击这个 HTML 文件，用 Edge 或 Chrome 打开。
4. 进入“设置”，填写自己的 `API key`、`Base URL`、文字模型、图片模型和超时时间。
5. 保存配置后开始生成图片。

注意：不要从 GitHub 源码文件列表里单独下载仓库根目录的 `index.html`。那个文件只是 Vite 的源码入口，不能独立运行。可直接使用的是 Release 附件 `gpt-image-2-studio-lite.html`。

维护者构建单文件 HTML：

```powershell
npm install
npm run build:static
```

构建产物在 `dist-static/gpt-image-2-studio-lite.html`。

## 作者推荐中转站

如果你还没有可用的模型服务，可以参考作者推荐中转站：

[https://ruoli.dev/register?aff=mR35](https://ruoli.dev/register?aff=mR35)

请自行评估服务稳定性、价格和合规性。本仓库不会提交任何真实 `API key`。

## 功能

- 默认中文界面，支持 `简体中文 / English` 切换。
- 本地保存 `API key`、`Base URL`、模型名、超时时间和默认图片参数。
- 支持文生图、图生图、多图参考，参考图最多 8 张，建议不超过 4 张。
- 支持拖拽上传图片。
- 支持图片尺寸、质量、格式和压缩质量设置。
- 支持批量生图：同一提示词多张、多行提示词排队、AI 拆分主任务。
- 批量任务支持间隔、有限并发、失败重试和成本风险暂停。
- 支持本地历史记录、搜索、过滤和批量删除。
- 支持 Windows 桌面安装包。

当前提示词模板功能不是核心能力，后续可能移除后重新设计为独立菜单。

## 项目范围

这个公开仓库只包含本地基础工具版，适合个人本地使用和轻量开源分发。

本仓库不包含：

- 用户注册、登录、积分和兑换码
- 平台托管 `API key`
- 支付流程
- 管理员后台
- 服务端队列、健康监控和供应商调度
- 服务端图片存储

这些能力属于尚未公开的平台版本，不会放入当前公开仓库的最新代码树。

## 源码本地启动

面向开发者：

```powershell
npm install
npm run dev
```

启动后访问终端显示的地址，通常是：

```text
http://localhost:5173/
```

如果 5173 端口被占用，可以关闭旧进程，或使用 Vite 提示的新端口。

## 常用命令

```powershell
npm run test:run
npm run build
npm run build:static
```

桌面开发：

```powershell
npm run desktop:dev
```

桌面打包：

```powershell
npm run desktop:build
```

## 发布

本仓库的 Release 链路会生成两类普通用户可用的附件：

- `gpt-image-2-studio-lite.html`：单文件 HTML，下载后双击打开。
- Windows `setup.exe`：桌面安装包，适合长期使用。

维护者发布前检查：

```powershell
npm run release:check
npm run test:run
npm run build
npm run build:static
```

完整流程见 [docs/release.md](./docs/release.md)。

## 文档

- [单文件 HTML 使用指南（中文）](./docs/user-guide-static-html.zh-CN.md)
- [Static HTML User Guide (English)](./docs/user-guide-static-html.en-US.md)
- [基础工具版使用指南（中文）](./docs/user-guide-basic-tool.zh-CN.md)
- [Basic Tool User Guide (English)](./docs/user-guide-basic-tool.en-US.md)
- [FAQ](./docs/faq.md)
- [Release 说明](./docs/release.md)
- [路线图](./docs/roadmap.md)

## 安全说明

- 不要把真实 `API key` 提交到仓库、Issue、截图或日志里。
- 单文件 HTML 和网页源码模式会把配置保存在当前浏览器本地存储中。
- 桌面版会使用本地应用配置和本地目录保存能力。
- 如果在公共电脑或他人电脑上使用，请不要保存自己的 `API key`。
