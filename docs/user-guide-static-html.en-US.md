# GPT-Image-2 Studio Single-File HTML Guide

This guide is for first-time GitHub users. The single-file HTML edition is designed to run without a development environment: download one HTML file, open it in a browser, configure your own provider, and start generating images.

## What To Download

Download this file from GitHub Releases:

```text
gpt-image-2-studio-lite.html
```

Do not download the repository root `index.html` from the source file list. That file is only the Vite source entry and cannot run by itself.

Recommended browser: Microsoft Edge or Chrome.

## Who Should Use It

Use it if:

- You already have your own `API key` and `Base URL`.
- You want text-to-image, image-to-image, multi-image references, and batch generation.
- You do not want to install a desktop app or use the command line.
- You want generated images saved on your own device.

Do not use it if:

- Your provider blocks browser CORS requests.
- You do not want to store an `API key` in browser local storage.
- You need login, credits, hosted keys, server queues, or cloud image storage.

## First Launch

1. Double-click `gpt-image-2-studio-lite.html`.
2. The local page opens in your browser.
3. A welcome dialog may appear on first launch. You can close it.
4. Open Settings first.
5. Save your configuration, then use Generate or Batch.

The default language is Simplified Chinese. You can switch to English in the header.

## Settings

Settings are stored locally in the current browser and are not uploaded to the author.

Required fields:

- `API key`: your model provider key. Do not post it in issues, screenshots, or chat logs.
- `Base URL`: provider endpoint, for example `https://example.com/v1`.
- Text model: used for prompt optimization, text connectivity testing, and AI batch splitting.
- Image model: used for text-to-image and image-to-image.

Author recommended relay provider:

[https://ruoli.dev/register?aff=mR35](https://ruoli.dev/register?aff=mR35)

Evaluate provider stability, pricing, and compliance yourself.

Settings include minimal tests for text, text-to-image, and image-to-image. You can still save settings if tests fail.

Use a timeout of at least `180` seconds. For slow image models, use `240` to `300` seconds.

## Generate

Generate is for a single image task.

Text-to-image:

1. Enter the prompt.
2. Optionally enter an image name. If empty, the app uses time plus prompt summary.
3. Optionally optimize the prompt.
4. Click Generate image.
5. Wait for completion and local saving.

Image-to-image:

1. Upload one or more reference images.
2. Enter the edit instruction.
3. Click Generate image.

The current limit is 8 reference images, with 4 or fewer recommended.

Common errors:

- `401` or `403`: invalid key, missing permission, or unavailable model.
- `429`: provider rate limit.
- `500`, `524`, or `upstream error`: provider or upstream failure. Retrying may still cost money.
- `response did not contain any image data`: the provider returned no image payload.
- CORS error: the provider does not allow direct browser requests.

## Batch

Batch prepares multiple independent image tasks.

Sources:

- Same prompt: create multiple variants.
- Multi-line prompts: each line becomes one task.
- AI split: use the text model to split one master task into N consistent subtasks.

Example master task:

```text
Create World Cup promotional posters for France / Japan / Belgium / Korea, using each country's native language.
```

With task count `4`, AI split should produce four independent prompts for France, Japan, Belgium, and Korea. You can edit each task before generation.

Conservative settings:

```text
Concurrency: 1
Interval seconds: 20 to 60
Max retries: 1
```

Batch draft state is saved locally when switching menus. Click Clear all to reset the current batch.

Successful batch outputs are added to History and saved with a `manifest.json`.

## History

History records successful generation tasks in the current browser.

You can view generation time, model, size, duration, output path, and prompt. You can also reuse prompts, search, filter, or bulk delete history items.

The HTML edition may not preview old images after refresh because browsers restrict local file access. The generated files remain in your download folder or selected output directory.

## Privacy And Security

- Your `API key` is stored in the current browser's local storage.
- Image requests are sent directly from your browser to your provider.
- The author's server does not receive your key, prompts, or images.
- Do not save keys on public computers.
