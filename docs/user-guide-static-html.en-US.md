# GPT-Image-2 Studio Static HTML Guide

This guide is for first-time GitHub users. The static HTML edition runs without a development environment: open the hosted page or download one HTML file, configure your own provider, and start generating images.

## Two Ways To Use It

### Hosted Static Page

Open:

[https://kdb-wind.github.io/gpt-image-2-studio/](https://kdb-wind.github.io/gpt-image-2-studio/)

The hosted page is best for quick usage. Your settings are stored in your own browser local storage. This project does not receive your `API key`.

### Offline HTML

Download this file from [GitHub Releases](https://github.com/KDB-Wind/gpt-image-2-studio/releases):

```text
gpt-image-2-studio-lite.html
```

Double-click it and open it with Microsoft Edge or Chrome.

Do not download the repository root `index.html` from the source file list. That file is only the development entry and cannot run by itself.

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

1. Open the hosted page or double-click `gpt-image-2-studio-lite.html`.
2. A welcome dialog may appear on first launch. You can close it.
3. Open Settings first.
4. Save your configuration.
5. Test the text model and image model.
6. Use Generate or Batch.

The default language is Simplified Chinese. You can switch to English in the header.

## Settings

Settings are stored locally in the current browser and are not uploaded to the author.

Required fields:

- `API key`: your model provider key. Do not post it in issues, screenshots, or chat logs.
- `Base URL`: provider endpoint, for example `https://example.com/v1`.
- Text model: used for prompt optimization, text connectivity testing, and batch planning.
- Image model: used for text-to-image and image-to-image.

Configure your own model provider endpoint:

`<PROVIDER_BASE_URL>`

Evaluate provider stability, pricing, and compliance yourself.

Settings include minimal tests for text, text-to-image, and image-to-image. You can still save settings if tests fail.

Timeout accepts `60` to `600` seconds. Shorter values are useful for quick 1K tests; for slower image models, 2K/4K generation, or complex prompts, use `180` to `300` seconds.

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

Current modes:

- Same prompt variants: create multiple images from one prompt.
- Custom multiple prompts: enter different prompts and run them as one batch.

Custom multiple prompts:

1. Set task count. The default is 5 and the maximum is 20.
2. The page creates one prompt input for each task.
3. Each input represents one image.
4. Use plus or minus buttons to add or remove tasks.
5. Click Create task list and review each task.
6. Click Start batch generation.

Conservative settings:

```text
Concurrency: 1 to 3
Interval seconds: 10 to 60
Max retries: 1
```

Automatic retries apply only to HTTP 429 responses that definitively rejected the request. Timeouts, HTTP 408, network errors, 5xx responses, and unknown outcomes require a manual retry because another submission may duplicate provider cost.

Concurrency means the number of simultaneous API requests sent to the model provider. It is not just local memory usage. Higher concurrency can increase provider pressure, rate-limit risk, and cost risk.

Batch draft state is saved locally when switching menus. Click Clear all to reset the current batch.

Successful batch outputs are added to History and saved with batch metadata.

## History

History records successful generation tasks in the current browser. File allocation, file writing, and history updates are serialized within the same open app instance, but browser file storage and browser history storage are not one cross-storage atomic transaction.

If browser storage rejects a history update after the image file or download succeeds, the result remains successful with a visible memory-only warning. The record remains usable in the current open app instance, but refresh or reopening will not restore it.

You can view generation time, model, size, duration, output path, and prompt. You can also reuse prompts, search, filter, or bulk delete history items.

Whether the HTML edition can preview old images after refresh depends on folder authorization in Settings. Seeing a folder name is not the same as granting file access. Click Choose and authorize folder, then Test output folder. After the test passes, history previews will try to restore images from that authorized folder.

If the browser refuses the Downloads root folder, create and authorize a `Downloads/gpt-image-2-studio` subfolder, or use a regular folder such as `D:\gpt-image-outputs`. Generated files remain in the browser download folder or the authorized output folder.

## Privacy And Security

- Your `API key` is stored in the current browser's local storage.
- Image requests are sent directly from your browser to your provider.
- The author's server does not receive your key, prompts, or images.
- Hosted `https://kdb-wind.github.io` and offline `file://` HTML use different browser storage.
- Do not save keys on public computers.

## CORS Test

Developers and maintainers can test whether a provider allows static-page browser access:

```powershell
$env:BASE_URL = "<PROVIDER_BASE_URL>"
$env:SITE_ORIGIN = "https://kdb-wind.github.io"
npm run cors:check
```

If the check fails, the provider probably cannot be called from a pure static web page.
