# GPT-Image-2 Studio

[简体中文](./README.md) | English

[![CI](https://github.com/KDB-Wind/gpt-image-2-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/KDB-Wind/gpt-image-2-studio/actions/workflows/ci.yml)
[![Release](https://github.com/KDB-Wind/gpt-image-2-studio/actions/workflows/release.yml/badge.svg)](https://github.com/KDB-Wind/gpt-image-2-studio/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

GPT-Image-2 Studio is a lightweight, local-first tool for calling `gpt-image-2`. Configure your own `API key`, `Base URL`, text model, and image model, then use text-to-image, image-to-image, multi-image references, and batch generation.

![GPT-Image-2 Studio bright UI preview](./docs/assets/app-preview.svg)

## Fastest Start: Single-File HTML

Normal users do not need Node.js and do not need to run `npm run dev`.

1. Open [GitHub Releases](https://github.com/KDB-Wind/gpt-image-2-studio/releases).
2. Download the latest `gpt-image-2-studio-lite.html` Release asset.
3. Double-click the HTML file and open it with Edge or Chrome.
4. Open Settings and fill in your own `API key`, `Base URL`, text model, image model, and timeout.
5. Save settings and start generating images.

Do not download the repository root `index.html` from the GitHub source file list. That file is only the Vite source entry and cannot run by itself. The directly usable file is the Release asset named `gpt-image-2-studio-lite.html`.

Maintainers can build it with:

```powershell
npm install
npm run build:static
```

The output is `dist-static/gpt-image-2-studio-lite.html`.

## Recommended Relay

If you need an OpenAI-compatible relay service, you can use the author's recommended link:

[https://ruoli.dev/register?aff=mR35](https://ruoli.dev/register?aff=mR35)

Evaluate provider stability, pricing, and compliance yourself. This repository must not contain any real `API key`.

## Features

- Chinese UI by default, with `简体中文 / English` switching.
- Local settings for `API key`, `Base URL`, model names, timeout, and image defaults.
- Text-to-image, image-to-image, and multi-image references.
- Up to 8 reference images, with 4 or fewer recommended.
- Drag-and-drop image upload.
- Image size, quality, format, and compression options.
- Batch generation: same prompt variants, multi-line prompt queue, and AI split from one master task.
- Batch interval, limited concurrency, failed-task retry, and cost-risk pause.
- Local history with search, filters, and bulk deletion.
- Windows desktop installer support.

The current prompt-template feature is not a core capability and may be removed and redesigned later.

## Project Scope

This public repository contains only the standalone local basic tool for personal use and lightweight open-source distribution.

It does not include:

- user registration, login, credits, or redemption codes
- hosted `API key` routing
- payment flows
- admin dashboard
- server queues, health monitoring, or provider scheduling
- server-side image storage

Those capabilities belong to a private platform edition and are not included in the current public code tree.

## Local Development

For developers:

```powershell
npm install
npm run dev
```

Then open the address shown by Vite, usually:

```text
http://localhost:5173/
```

## Common Commands

```powershell
npm run test:run
npm run build
npm run build:static
```

Desktop development:

```powershell
npm run desktop:dev
```

Desktop packaging:

```powershell
npm run desktop:build
```

## Releases

The release chain produces two user-facing assets:

- `gpt-image-2-studio-lite.html`: single-file HTML that opens directly in a browser.
- Windows `setup.exe`: desktop installer for longer-term local use.

Maintainer pre-release checks:

```powershell
npm run release:check
npm run test:run
npm run build
npm run build:static
```

See [docs/release.en.md](./docs/release.en.md) for the full release process.

## Documentation

- [单文件 HTML 使用指南（中文）](./docs/user-guide-static-html.zh-CN.md)
- [Static HTML User Guide (English)](./docs/user-guide-static-html.en-US.md)
- [基础工具版使用指南（中文）](./docs/user-guide-basic-tool.zh-CN.md)
- [Basic Tool User Guide (English)](./docs/user-guide-basic-tool.en-US.md)
- [FAQ](./docs/faq.md)
- [Release Guide](./docs/release.en.md)
- [Roadmap](./docs/roadmap.md)

## Security

- Do not commit real `API key` values.
- The single-file HTML and source web modes store settings in browser local storage.
- The desktop app uses local app configuration and local save paths.
- Do not save keys on shared computers.
