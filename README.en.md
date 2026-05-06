# GPT-Image-2 Studio

[简体中文](./README.md) | [English](./README.en.md)

[![CI](https://github.com/KDB-Wind/gpt-image-2-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/KDB-Wind/gpt-image-2-studio/actions/workflows/ci.yml)
[![Release](https://github.com/KDB-Wind/gpt-image-2-studio/actions/workflows/release.yml/badge.svg)](https://github.com/KDB-Wind/gpt-image-2-studio/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

A lightweight, local-first tool for `gpt-image-2`, with text-to-image, image-to-image, multi-image references, prompt templates, history, and Windows desktop installer support.

![GPT-Image-2 Studio bright UI preview](./docs/assets/app-preview.svg)

## Install For Normal Users

Normal users do not need to install Node.js, npm, or Rust.

1. Open [Releases](https://github.com/KDB-Wind/gpt-image-2-studio/releases).
2. Download the latest `setup.exe`.
3. Install and open the app.
4. Fill in your own `API key`, `Base URL`, text model, image model, and output directory in Settings.
5. Save the settings and start generating images.

If Windows shows a SmartScreen warning, it is because the first public version is not code-signed yet. Download installers only from this repository's Release page.

## Recommended Relay

If you need an OpenAI-compatible relay service, you can use the author's recommended link:

[https://ruoli.dev/register?aff=mR35](https://ruoli.dev/register?aff=mR35)

## Project Scope

This public repository contains only the standalone basic tool, intended for personal local use and lightweight sharing.

It does not include:

- platform APIs
- queue workers
- payment flows
- user registration and login
- hosted key routing
- platform-level provider circuit breaker and admin management

Those parts belong to a separately maintained private platform codebase.

## Features

- Chinese UI by default, with `简体中文 / English` switching.
- Configurable `API key`, `Base URL`, text model, image model, timeout, and output directory.
- Text-to-image and image-to-image generation.
- Up to 8 reference images, with 4 or fewer recommended.
- Drag-and-drop multi-image upload.
- Image size, quality, format, and compression options.
- Built-in minimal connectivity tests for text, text-to-image, and image-to-image.
- Built-in local prompt templates and custom templates.
- Local history with search, filters, and batch deletion.
- Date-based local image saving.
- Tauri Windows desktop packaging support.

## Default Settings

- `Base URL`: `https://ruoli.dev/v1`
- `Text model`: `gpt-5.4-mini`
- `Image model`: `gpt-image-2`
- `API key`: blank by default
- `Timeout`: at least `180` seconds is recommended
- `Output directory`: `outputs`

## Security Notes

- `API key` is not stored in the repository.
- Web settings are stored in browser local storage.
- The desktop app prefers system secure storage and falls back to a local config file only when secure storage is unavailable.
- Real `.env` files are ignored and not tracked.
- This public repository is a clean snapshot exported from a private multi-product codebase, so unrelated platform history is not exposed.

If you exposed a real `API key` somewhere else before, rotate it first.

## Local Development

Requirements:

- Node.js `>= 20.19.0`
- npm `>= 10`
- Rust toolchain is required only if you build the Tauri desktop version

Install dependencies:

```powershell
npm install
```

Start the web version:

```powershell
npm run dev
```

Build the web app:

```powershell
npm run build
```

Run tests:

```powershell
npm run test:run
```

If you want npm cache and downloads on `D:`:

```powershell
$env:npm_config_cache = "D:\npm-cache"
npm install
```

## Desktop Development

Run the desktop app in development:

```powershell
npm run desktop:dev
```

Build the desktop package:

```powershell
npm run desktop:build
```

## Releasing Installers

This repository includes a GitHub Actions release chain. When a `v*.*.*` tag is pushed, the workflow builds Tauri Windows installers and creates a draft GitHub Release.

Normal users should download the `setup.exe` installer first. Source-based usage is recommended for developers only.

Local pre-release check:

```powershell
npm run release:check
```

See [docs/release.en.md](./docs/release.en.md) for the full process, [docs/release-notes/v0.1.0.md](./docs/release-notes/v0.1.0.md) for the first release text, and [docs/release-checklist.md](./docs/release-checklist.md) for the manual QA checklist.

## Contributing And Feedback

- Read [FAQ](./docs/faq.md) before opening an issue.
- Read [CONTRIBUTING.md](./CONTRIBUTING.md) before contributing code.
- Read [SECURITY.md](./SECURITY.md) for security reports.

## Roadmap

The remaining work is tracked in [docs/roadmap.md](./docs/roadmap.md).
