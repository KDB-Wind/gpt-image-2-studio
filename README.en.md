# GPT-Image-2 Studio

[简体中文](./README.md) | [English](./README.en.md)

A lightweight, local-first tool for `gpt-image-2`, with text-to-image, image-to-image, multi-image references, history, and desktop packaging support.

## Recommended Relay

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

- Chinese UI by default, with `简体中文 / English` switching
- configurable `API key`, `Base URL`, text model, image model, timeout, and output directory
- text-to-image generation
- image-to-image generation
- up to 8 reference images
- drag-and-drop multi-image upload
- built-in minimal connectivity tests for text, text-to-image, and image-to-image
- local history and prompt reuse
- date-based local image saving
- Tauri desktop packaging support

## Default Settings

- `Base URL`: `https://ruoli.dev/v1`
- `Text model`: `gpt-5.4-mini`
- `Image model`: `gpt-image-2`
- `API key`: blank by default
- `Timeout`: at least `180` seconds is recommended
- `Output directory`: `outputs`

## Security Notes

- `API key` is not stored in the repository.
- Local settings are saved on the current user's device.
- Real `.env` files are ignored and not tracked.
- This public repository is a clean snapshot exported from a private multi-product codebase, so unrelated platform history is not exposed.

If you exposed a real `API key` somewhere else before, rotate it first.

## Requirements

- Node.js `>= 20.19.0`
- npm `>= 10`
- Rust toolchain is required only if you build the Tauri desktop version

If you want npm cache and downloads on `D:`:

```powershell
$env:npm_config_cache = "D:\npm-cache"
npm install
```

## Development

Install dependencies:

```powershell
$env:npm_config_cache = "D:\npm-cache"
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

## Desktop

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

Normal users should download the `setup.exe` installer first.

Local pre-release check:

```powershell
npm run release:check
```

See [docs/release.en.md](./docs/release.en.md) for the full process.
