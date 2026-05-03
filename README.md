# GPT-Image-2 Studio

`GPT-Image-2 Studio` is a lightweight local tool for OpenAI-compatible image generation.

It is focused on personal use and small-scale sharing:

- text-to-image generation
- image-to-image generation
- multi-image upload and drag-and-drop
- local config saved per user
- local image history saved by date
- optional Windows desktop packaging with Tauri

This public repository contains the basic standalone tool only. Platform code, hosted queue logic, payments, user accounts, and server-side provider management are intentionally excluded.

## Features

- default Chinese UI with `简体中文 / English` switching
- configurable `API key`, `Base URL`, text model, image model, timeout, and output directory
- image-to-image with up to 8 reference images
- built-in text model, text-to-image, and image-to-image connectivity tests
- brighter desktop-first interface
- local history preview and reusable prompts
- fixed local save directory with timestamp-based naming

## Default Settings

- `Base URL`: `https://ruoli.dev/v1`
- `Text model`: `gpt-5.4-mini`
- `Image model`: `gpt-image-2`
- `API key`: blank by default
- `Timeout`: `180` seconds minimum
- `Output directory`: `outputs`

## Security

- `API key` is not stored in the repository.
- Local settings are saved on the current user's device.
- Real `.env` files are ignored.
- Before publishing, this snapshot was separated from the private multi-product repository to avoid pushing unrelated platform history.

If you previously exposed a real API key anywhere else, rotate it before public distribution.

## Requirements

- Node.js `>= 20.19.0`
- npm `>= 10`
- Rust toolchain is required only for Tauri desktop builds

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

## Desktop Build

Run the desktop app in development:

```powershell
npm run desktop:dev
```

Build the Windows desktop package:

```powershell
npm run desktop:build
```

## Project Scope

This repository does not include:

- hosted platform APIs
- worker queues
- payment flows
- user registration and login
- provider circuit breaker management UI
- server-side key routing

Those pieces belong to a separate private platform codebase.
