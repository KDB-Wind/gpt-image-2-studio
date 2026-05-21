# GPT-Image-2 Studio

一个轻量、开箱即用的 `gpt-image-2` 生图工具。

如果你只是想用自己的 `API key` 调用图片模型，不想搭后端、不想写代码，也不想每次都复制一堆请求参数，这个项目就是为这个场景做的。

[English](./README.en.md)

[![CI](https://github.com/KDB-Wind/gpt-image-2-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/KDB-Wind/gpt-image-2-studio/actions/workflows/ci.yml)
[![Pages](https://github.com/KDB-Wind/gpt-image-2-studio/actions/workflows/pages.yml/badge.svg)](https://github.com/KDB-Wind/gpt-image-2-studio/actions/workflows/pages.yml)
[![Release](https://github.com/KDB-Wind/gpt-image-2-studio/actions/workflows/release.yml/badge.svg)](https://github.com/KDB-Wind/gpt-image-2-studio/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

![GPT-Image-2 Studio 界面预览](./docs/assets/app-preview.svg)

## 先试试看

最快方式是直接打开在线静态页：

[https://kdb-wind.github.io/gpt-image-2-studio/](https://kdb-wind.github.io/gpt-image-2-studio/)

这个页面没有后端服务。你的请求会从浏览器直接发到你填写的 `Base URL`，配置也只保存在你自己的浏览器里。

第一次使用：

1. 打开在线页面。
2. 进入「设置」。
3. 填写自己的 `API key`、`Base URL`、文字模型名和图片模型名。
4. 点击「保存配置」。
5. 先测试文字模型和图片模型，再开始生成。

如果你还没有可用的模型服务，可以参考作者推荐的中转站：

[https://ruoli.dev/register?aff=mR35](https://ruoli.dev/register?aff=mR35)

请自行判断服务稳定性、价格和合规性。仓库不会内置任何真实 `API key`。

## 下载单文件 HTML

如果你想完全放在本地使用，可以下载一个单文件 HTML：

1. 打开 [Releases](https://github.com/KDB-Wind/gpt-image-2-studio/releases)。
2. 下载最新版本里的 `gpt-image-2-studio-lite.html`。
3. 用 Edge 或 Chrome 打开这个文件。
4. 在「设置」里填写自己的接口配置。

不要直接下载源码列表里的 `index.html`。那个文件只是开发入口，不能单独运行。真正可以双击使用的是 Release 里的 `gpt-image-2-studio-lite.html`。

## 你可以用它做什么

常规生图：

- 输入一段提示词，生成图片。
- 上传 1 到 8 张参考图，进行图生图或多图参考生成。
- 拖拽上传图片。
- 设置图片尺寸、质量、格式和压缩参数。

批量生图：

- 用同一个提示词连续生成多张变体。
- 一次填写多条不同提示词，排队生成多张图。
- 设置并发数、间隔时间和失败重试。
- 批量任务结束后，可以在历史记录里查看结果。

历史管理：

- 本地保存生成记录。
- 搜索、筛选、查看和删除历史图片。
- 历史记录保存在当前浏览器本地，不会上传到项目服务器。

## 页面里的几个菜单

「生成」适合单张图片。输入提示词，选择参数，点击生成。

「批量」适合一次生成多张图片。你可以选择同一提示词生成多张，也可以手动填写多条完全不同的提示词。

「历史」用于查看之前生成过的图片和提示词。

「设置」用于保存 `API key`、`Base URL`、模型名、超时时间和默认图片参数。

## 需要注意的事

静态网页能不能直接调用你的模型服务，取决于供应商是否允许浏览器跨域请求，也就是 CORS。

如果页面提示跨域错误，这通常不是项目代码坏了，而是供应商不允许浏览器直接访问。你可以换一个支持 CORS 的供应商，或使用桌面版/自建代理。

图片生成可能很慢。有些模型生成一张图需要 1 到 3 分钟，建议把超时时间设置得长一点。

生成失败也可能产生接口调用成本，尤其是模型供应商已经接收请求但返回异常内容时。批量生成前建议先小批量测试。

## 隐私和安全

- 不要把真实 `API key` 提交到仓库、Issue、截图或日志里。
- 在线静态页和本地 HTML 都只把配置保存在当前浏览器本地。
- `file://` 打开的本地 HTML 和 GitHub Pages 在线页面属于不同来源，本地配置不会互通。
- 如果在公共电脑上使用，请不要保存自己的 `API key`。
- 本项目不托管、不收集、不转发你的 `API key`。
- 本项目不包含第三方统计脚本。

## 本地开发

如果你想改代码或自己构建：

```powershell
npm install
npm run dev
```

启动后打开终端显示的地址，通常是：

```text
http://localhost:5173/
```

构建单文件 HTML：

```powershell
npm run build:static
npm run site:check
```

常用检查：

```powershell
npm run test:run
npm run build
```

## 文档

- [静态 HTML 使用指南](./docs/user-guide-static-html.zh-CN.md)
- [基础工具版使用指南](./docs/user-guide-basic-tool.zh-CN.md)
- [静态站发布指南](./docs/static-site-hosting.zh-CN.md)
- [FAQ](./docs/faq.md)
- [Release 指南](./docs/release.md)

## License

MIT
