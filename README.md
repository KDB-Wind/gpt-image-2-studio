# GPT Image 2 Studio

中文为主文档语言，English is available as a secondary guide.

- [静态 HTML 版使用指南（中文）](docs/user-guide-static-html.zh-CN.md)
- [Static HTML User Guide (English)](docs/user-guide-static-html.en-US.md)
- [基础工具版使用指南（中文）](docs/user-guide-basic-tool.zh-CN.md)
- [Basic Tool User Guide (English)](docs/user-guide-basic-tool.en-US.md)

## 项目定位

GPT Image 2 Studio 是一个轻量的本地生图调用工具。用户填写自己的 `API key`、`Base URL`、文字模型和图片模型后，即可进行文生图、图生图、多图参考和批量生图。

当前仓库同时保留两个方向：

- 基础工具版：面向个人本地使用和 GitHub 开源分发，不包含用户管理、积分、平台托管 Key、支付和服务端图片存储。
- Web 平台版：面向后续公网服务，包含注册、兑换码积分、平台托管 Key、供应商熔断、健康探测和轻后台能力。

如果你只是第一次在 GitHub 上看到这个项目，并且只想快速使用基础工具版，优先使用静态 HTML 版。

## 最快使用方式：静态 HTML 版

静态 HTML 版不需要安装 Node.js，不需要运行 `npm run dev`，也不需要作者提供后端服务器。

普通用户只需要：

1. 在 GitHub Release 中下载静态 HTML 版本压缩包，或直接下载发布资产里的 `index.html`。
2. 双击打开 `index.html`。
3. 进入“设置”，填写自己的 `API key`、`Base URL`、文字模型、图片模型和超时时间。
4. 保存配置后开始生成图片。

维护者构建静态 HTML：

```powershell
npm install
npm run build:static
```

构建完成后发布 `dist-static/index.html` 即可。详细说明见 [静态 HTML 版使用指南（中文）](docs/user-guide-static-html.zh-CN.md)。

## 作者推荐中转站

如果你还没有可用的模型服务，可以参考作者推荐中转站：

[https://ruoli.dev/register?aff=mR35](https://ruoli.dev/register?aff=mR35)

请自行评估服务稳定性、价格和合规性。本项目不会把任何真实 `API key` 提交到仓库。

## 基础工具版能力

- 文生图：输入提示词，调用图片模型生成图片。
- 图生图：上传图片并输入修改说明，调用图片编辑接口。
- 多图参考：最多 8 张，建议不超过 4 张。
- 拖拽上传：支持把图片拖到上传区域。
- 批量生图：支持同一提示词多张、多行提示词排队、AI 拆分主任务。
- 本地历史：记录成功生成的图片信息，方便复用提示词。
- 本地配置：`API key`、`Base URL`、模型名、超时时间和默认图片参数保存在当前用户本机。

当前提示词模板能力不是核心功能，后续计划移除后重新设计为独立菜单。

## 常用命令

源码网页模式：

```powershell
npm run dev
```

静态 HTML 构建：

```powershell
npm run build:static
```

桌面版开发：

```powershell
npm run desktop:dev
```

桌面版打包：

```powershell
npm run desktop:build
```

测试：

```powershell
npm run test:run
npm run build
```

## 安全说明

- 仓库不应包含真实 `API key`。
- 静态 HTML 版会把配置保存在当前浏览器本地存储中。
- 源码网页模式同样主要使用浏览器本地存储。
- 桌面版会使用本地应用配置文件和本地目录保存能力。
- 如果在公共电脑或他人电脑上使用，请不要保存自己的 `API key`。

## 更多文档

- [产品版本说明](docs/product-editions.md)
- [本地手动验收](docs/manual-local-acceptance.md)
- [批量生图验收](docs/manual-batch-generation-acceptance.md)
- [Web 平台部署说明](docs/deployment/4c4g-linux-platform.md)
