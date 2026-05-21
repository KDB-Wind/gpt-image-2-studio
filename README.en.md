# GPT-Image-2 Studio

[简体中文](./README.md) | English

[![CI](https://github.com/KDB-Wind/gpt-image-2-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/KDB-Wind/gpt-image-2-studio/actions/workflows/ci.yml)
[![Pages](https://github.com/KDB-Wind/gpt-image-2-studio/actions/workflows/pages.yml/badge.svg)](https://github.com/KDB-Wind/gpt-image-2-studio/actions/workflows/pages.yml)
[![Release](https://github.com/KDB-Wind/gpt-image-2-studio/actions/workflows/release.yml/badge.svg)](https://github.com/KDB-Wind/gpt-image-2-studio/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

GPT-Image-2 Studio is a lightweight, local-first tool for calling `gpt-image-2`. Configure your own `API key`, `Base URL`, text model, and image model, then use text-to-image, image-to-image, multi-image references, and batch generation.

![GPT-Image-2 Studio bright UI preview](./docs/assets/app-preview.svg)

## Fastest Start: Hosted Static Page

Normal users do not need Node.js and do not need to run `npm run dev`.

Hosted page:

[https://kdb-wind.github.io/gpt-image-2-studio/](https://kdb-wind.github.io/gpt-image-2-studio/)

First use:

1. Open the hosted static page.
2. Open Settings and fill in your own `API key`, `Base URL`, text model, image model, and timeout.
3. Save settings.
4. Test the text model and image model.
5. Use Generate or Batch.

The hosted page uses BYOK, Bring Your Own Key. Your `API key` is stored in your own browser local storage, and requests are sent directly from your browser to the `Base URL` you enter. This project does not host, collect, or proxy your key.

## Offline Single-File HTML

If you prefer local usage, download the single-file HTML:

1. Open [GitHub Releases](https://github.com/KDB-Wind/gpt-image-2-studio/releases).
2. Download the latest `gpt-image-2-studio-lite.html` Release asset.
3. Double-click the HTML file and open it with Edge or Chrome.
4. Open Settings and fill in your own `API key`, `Base URL`, and model names.

Do not download the repository root `index.html` from the GitHub source file list. That file is only the Vite source entry and cannot run by itself. The directly usable file is the Release asset named `gpt-image-2-studio-lite.html`.

Maintainers can build it with:

```powershell
npm install
npm run build:static
npm run site:check
```

Outputs:

```text
dist-static/index.html
dist-static/gpt-image-2-studio-lite.html
```

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
- Batch generation: same prompt variants and custom multiple prompts.
- Batch interval, limited concurrency, failed-task retry, and cost-risk pause.
- Local history with search, filters, and bulk deletion.
- Windows desktop installer support.

The current prompt-template feature is not a core capability and may be removed and redesigned later.

## Static Site Limitation

Whether a static HTML page can call a model API directly depends on the provider's browser CORS policy.

You can test a provider with:

```powershell
$env:BASE_URL = "https://ruoli.dev/v1"
$env:SITE_ORIGIN = "https://kdb-wind.github.io"
npm run cors:check
```

If CORS fails, the browser blocks the request. This cannot be fixed by the static page alone. Use a CORS-compatible provider, the desktop app, or your own proxy service.

## Project Scope

This public repository contains only the standalone local basic tool for personal use, static-page usage, and lightweight open-source distribution.

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
npm run site:check
npm run cors:check
```

Desktop development:

```powershell
npm run desktop:dev
```

Desktop packaging:

```powershell
npm run desktop:build
```

## Documentation

- [静态 HTML 使用指南](./docs/user-guide-static-html.zh-CN.md)
- [Static HTML User Guide](./docs/user-guide-static-html.en-US.md)
- [静态站发布指南](./docs/static-site-hosting.zh-CN.md)
- [Static Site Hosting Guide](./docs/static-site-hosting.en-US.md)
- [基础工具版使用指南](./docs/user-guide-basic-tool.zh-CN.md)
- [Basic Tool User Guide](./docs/user-guide-basic-tool.en-US.md)
- [FAQ](./docs/faq.md)
- [Release Guide](./docs/release.en.md)
- [Roadmap](./docs/roadmap.md)

## Security

- Do not commit real `API key` values.
- The hosted static page and single-file HTML store settings in browser local storage.
- Offline `file://` HTML and the hosted `https://kdb-wind.github.io` page use different browser origins, so their local storage is separate.
- Do not save keys on shared computers.
- This project does not include third-party analytics scripts.
