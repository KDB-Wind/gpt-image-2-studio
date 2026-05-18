# GPT Image 2 Studio Lite Static HTML User Guide

This guide is for first-time GitHub users. The Static HTML edition is designed to run without a development environment: download one HTML file, open it in a browser, configure your own provider, and start generating images.

Chinese is the primary documentation language. This English guide mirrors the core workflow.

## Minimum Download

Use the GitHub Release asset for the static build.

- Minimum file: `index.html`
- Recommended browser: Microsoft Edge or Chrome
- No source code required
- No Node.js required
- No `npm run dev` required
- No backend server from the author

If the Release asset is a zip file, unzip it first, then double-click `index.html`.

## Who Should Use This Edition

Use it if:

- You already have your own `API key` and `Base URL`.
- You want text-to-image, image-to-image, multi-image references, and batch generation.
- You do not want to install a desktop app or use the command line.
- You want generated images saved on your own device.

Do not use it if:

- Your provider blocks browser CORS requests.
- You do not want to store an `API key` in browser local storage.
- You need login, credits, platform-managed keys, server queues, or cloud image storage.

## First Launch

1. Double-click `index.html`.
2. The local page opens in your browser.
3. A welcome dialog may appear on first launch. You can close it.
4. Open the Settings menu first.
5. Save your configuration, then use Generate or Batch.

The default language is Simplified Chinese. You can switch to English in the header. The language choice is saved locally in your browser.

## Menu 1: Settings

Settings are required before generation. They are stored locally in the current browser and are not uploaded to the author.

### Connection

Required fields:

- `API key`: your model provider key. Do not post it in GitHub issues or screenshots.
- `Base URL`: provider endpoint, for example `https://example.com/v1`. If you enter only the domain, the app normalizes it to `/v1`.
- Text model: used for prompt optimization, text connectivity testing, and AI batch splitting.
- Image model: used for text-to-image and image-to-image.

Author recommended relay provider:

[https://ruoli.dev/register?aff=mR35](https://ruoli.dev/register?aff=mR35)

Evaluate provider stability, pricing, and compliance yourself.

### Connectivity Tests

The Settings page includes:

- Test text model: verifies that the text model returns readable content.
- Test image model: generates a small test image.
- Test image edit model: uses a built-in reference image to verify image-to-image.

You can still save settings if tests fail, but a failure usually means the key, URL, model name, provider status, or CORS policy needs attention.

### Generation Defaults

Common options:

- Timeout: at least 180 seconds. Use 240 to 300 seconds for slow image models.
- Default size: `auto`, 1K, 2K, 4K, or a custom width and height.
- Image count: 1 to 4 images per request.
- Quality: `auto`, `low`, `medium`, or `high`.
- Format: `png`, `jpeg`, or `webp`.
- Compression: applies to `jpeg` and `webp`.

High-resolution outputs may take longer and may not be supported by every compatible provider. If unsure, start with `1024x1024` or `auto`.

### Output Directory

The HTML edition saves images in two ways:

- If the browser supports directory selection, you can choose a local folder.
- If not, the browser downloads files normally.

Edge and Chrome support directory selection better than Firefox and some other browsers.

### Save Settings

Click Save settings after editing. Settings are written to browser local storage. If you clear browser data or switch browsers/devices, you need to configure again.

## Menu 2: Generate

Generate is for a single image task.

### Text-to-Image

1. Enter the prompt.
2. Optionally enter a custom image name. If empty, the app uses time plus prompt summary.
3. Optionally optimize the prompt with the text model.
4. Click Generate image.
5. Wait for completion.
6. The result appears in the preview area and is saved locally.

Example:

```text
Create a 2026 World Cup promotional poster for France, with French typography, blue-white-red palette, cinematic poster style, clear main subject, suitable for a social media cover.
```

### Image-to-Image

1. Upload one or more reference images.
2. Enter the edit instruction.
3. Click Generate image.

When reference images are present, the app calls the image edit endpoint. Without reference images, it calls the image generation endpoint.

The current limit is 8 reference images, with 4 or fewer recommended. More images create larger requests and may increase failure rate.

### Drag and Drop

You can drag image files from a folder into the upload area. Uploaded images can be removed individually.

### Common Generation Errors

- `Request timed out`: increase the timeout in Settings.
- `status 401` or `status 403`: invalid key, missing permission, or unavailable model.
- `status 429`: provider rate limit.
- `status 500`, `524`, or `upstream error`: provider or upstream service failed. Retrying may still cost money.
- `response did not contain any image data`: the API returned success-like data but no image payload.
- CORS error: the provider does not allow direct browser requests. Use the desktop edition or a proxy.

## Menu 3: Batch

Batch prepares multiple independent image tasks. Each subtask is sent as a separate image request so prompts do not share context.

### Batch Sources

Same prompt:

Use one prompt to create multiple variants.

Multi-line prompts:

Paste multiple prompts. Each line becomes one task.

AI split:

Use the text model to split one master task into N consistent subtasks. For example, "Create World Cup posters for France / Japan / Belgium / Korea in each country's native language" with count 4 should produce four independent prompts.

### AI Split Templates

Built-in split templates:

- Basic split
- Style-consistent split
- Series split
- Custom `systemPrompt`

These templates only create sub-prompts. After splitting, you can edit each title and prompt before generation.

The current prompt-template feature is not a core selling point and may be removed and redesigned as a separate menu later.

### Batch Parameters

- Batch title: used for output folder and `manifest.json`.
- Task count: used by Same prompt and AI split.
- Concurrency: how many image requests run at the same time. Default 1, maximum 3.
- Interval seconds: delay between requests. Default 20 seconds, range 0 to 300.
- Max retries: automatic retries per failed task. Default 1, maximum 3.

Recommended conservative settings:

```text
Concurrency: 1
Interval seconds: 20 to 60
Max retries: 1
```

### Run a Batch

1. Select a batch source.
2. Enter the master prompt or multi-line prompts.
3. Click Create task list or Split with text model.
4. Review and edit each subtask.
5. Click Start batch generation.
6. Wait for all tasks to succeed, fail, or be skipped.

You can pause or cancel while running. Failed tasks show error details and can be retried individually after the run.

### Batch Output

Successful images are added to History. Batch runs also save `manifest.json`, which records the batch ID, title, parameters, prompts, task statuses, durations, and output paths.

If browser directory writing is available, files are saved into a batch folder. Otherwise, the browser downloads each image and manifest file.

### Cost-Risk Pause

If the provider returns a high-cost failure where the request may have been charged but no image was returned, the batch pauses to avoid continued cost.

## Menu 4: History

History records successful generation tasks in the current browser.

You can:

- Review generation time, model, size, duration, and output path.
- Select a record to view its prompt.
- Reuse a previous prompt.

The HTML edition may not be able to preview old images after refresh because browsers do not allow arbitrary local file access. The generated image files remain in your download folder or selected output directory.

Clearing browser data removes history records, but it does not delete already downloaded image files.

## Privacy and Security

- Your `API key` is stored in the current browser's local storage.
- Image requests are sent directly from your browser to your provider.
- The author's server does not receive your key, prompts, or images in this edition.
- Do not save keys on public or shared computers.
- Do not share screenshots or files that reveal your key.

## HTML vs Source Web vs Desktop

| Item | Static HTML | Source Web | Desktop |
| --- | --- | --- | --- |
| Startup | Open `index.html` | `npm run dev` | Installer or `npm run desktop:dev` |
| Node.js | Not required | Required | Required for development |
| Backend | Not required | Not required | Not required |
| Saving | Browser download or directory picker | Browser download or directory picker | Native local saving |
| CORS | Affected | Affected | Usually less affected |
| Best for | Quick user trial | Developer debugging | Long-term local use |

## Troubleshooting

If requests do not work:

1. Check whether `Base URL` ends with `/v1`.
2. Check whether the `API key` is valid.
3. Check whether model names match your provider.
4. Test the text model first, then the image model.
5. Open browser developer tools and check for CORS errors.
6. For provider `500`, `524`, or `upstream error`, wait for recovery.

If images take too long:

1. Increase timeout to 240 or 300 seconds.
2. Lower the image size.
3. Set batch concurrency to 1.
4. Set batch interval to 20 to 60 seconds.

If you cannot find saved images:

1. Check the browser download folder.
2. Check your selected output directory.
3. For batch runs, look for the batch folder and `manifest.json`.
