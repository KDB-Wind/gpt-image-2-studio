# GPT-Image-2 Studio

A lightweight browser workspace for `gpt-image-2`. Open the page, enter your own `API key` and `Base URL`, then use it for single-image generation, image-to-image, and batch generation.

There is no hosted backend. Your API key is sent only with requests to the `Base URL` you enter.

[简体中文](./README.md)

[![CI](https://github.com/KDB-Wind/gpt-image-2-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/KDB-Wind/gpt-image-2-studio/actions/workflows/ci.yml)
[![Pages](https://github.com/KDB-Wind/gpt-image-2-studio/actions/workflows/pages.yml/badge.svg)](https://github.com/KDB-Wind/gpt-image-2-studio/actions/workflows/pages.yml)
[![Release](https://github.com/KDB-Wind/gpt-image-2-studio/actions/workflows/release.yml/badge.svg)](https://github.com/KDB-Wind/gpt-image-2-studio/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

![GPT-Image-2 Studio preview](./docs/assets/app-preview.png)

## Try It First

Hosted static page:

[https://kdb-wind.github.io/gpt-image-2-studio/](https://kdb-wind.github.io/gpt-image-2-studio/)

For local use, download `gpt-image-2-studio-lite.html` from [Releases](https://github.com/KDB-Wind/gpt-image-2-studio/releases) and open it with Edge or Chrome.

First use:

1. Open Settings.
2. Enter your own `API key`, `Base URL`, text model, and image model.
3. Configure output folder, timeout, image size, and quality if needed.
4. Save settings.
5. Test the text model and image model before real generation.

If you do not have a provider yet, you may check the author's optional relay recommendation:

[https://ruoli.dev/register?aff=mR35](https://ruoli.dev/register?aff=mR35)

You can use any compatible `Base URL`. Evaluate service stability, pricing, and compliance yourself. This repository does not include any real `API key`.

## Batch Generation

The Batch tab helps you prepare multiple image tasks and run them with controlled concurrency, interval, and retries.

### Same Prompt, Multiple Images

Use this when you want multiple variants from one creative goal, such as five product posters with the same style.

1. Select Same prompt.
2. Enter the master prompt and task count.
3. Optionally add a batch style lock.
4. Create the task list.
5. Review each task title, prompt, and image name.
6. Start the batch.

If the master prompt contains multiple subjects, such as "create World Cup posters for France, Japan, Korea, and Brazil", you can use the text model planner. It calls your configured text model, splits the master task into editable sub-prompts, and tries to recommend a better task count.

### Custom Multiple Prompts

Use this when every image needs a different prompt.

1. Select Custom prompts.
2. Enter one prompt per input box.
3. Add or remove prompt boxes as needed, up to 20 tasks.
4. Create the task list.
5. Review and start the batch.

### Batch Controls

- `Concurrency`: how many image requests are sent at the same time.
- `Interval`: how long to wait between groups of requests.
- `Retries`: how many times a failed task is retried.

Start with a small batch first. Failed image requests may still cost money if the provider already accepted the request.

### Batch Image-To-Image

Batch generation also supports reference images:

- Batch reference images are sent with every task.
- Each task can also have its own reference images.
- The current UI allows up to 8 reference images per task, but actual multi-image support depends on your provider.

The right preview panel shows batch progress, the latest completed image, and generated thumbnails. Completed images and prompts are also saved to History.

## Single Image, History, Settings

Single Image is for one-off text-to-image or image-to-image work.

History stores local generation records so you can review images and reuse prompts. Records stay in the current browser.

Settings stores model configuration, default image options, batch defaults, and output folder settings. In the web version, restoring old image previews requires browser folder authorization; typing a `C:\...` path manually does not grant file access.

## Notes

- Static pages can call your provider only if the provider allows browser CORS requests.
- If you see a CORS error, use a CORS-compatible provider or your own proxy.
- Keep Official GPT Image mode for standard responses. Use force-base64 only when a compatible relay explicitly requires it.
- Timeout accepts 60 to 600 seconds. Shorter values are useful for quick 1K tests; for 2K/4K or slower providers, use 180 to 300 seconds to avoid aborting locally too early.
- Hosted GitHub Pages and local `file://` HTML have separate browser storage.
- Do not put real `API key` values in issues, screenshots, logs, or commits.

## Minimal API Call Example

If you only want to see what this page sends behind the scenes, start with this minimal request. It does not depend on this project and can be adapted into your own script or workflow.

```js
const baseUrl = "https://your-provider.example/v1";
const apiKey = "YOUR_API_KEY";

const response = await fetch(`${baseUrl.replace(/\/$/, "")}/images/generations`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "gpt-image-2",
    prompt: "Create a warm natural-light coffee poster",
    size: "1024x1024",
    quality: "auto",
    n: 1,
  }),
});

const data = await response.json();
const imageBase64 = data.data?.[0]?.b64_json;
console.log(imageBase64 ? "Image returned" : data);
```

If you run this directly in a browser, your provider must allow CORS. If you run it from Node.js, a local script, or your own backend, browser CORS does not apply.

## Local Development

```powershell
npm install
npm run dev
```

Build the single-file HTML:

```powershell
npm run build:static
npm run site:check
```

Common checks:

```powershell
npm run test:run
npm run build
```

## Docs

- [Static HTML User Guide](./docs/user-guide-static-html.en-US.md)
- [Basic Tool User Guide](./docs/user-guide-basic-tool.en-US.md)
- [Static Site Hosting Guide](./docs/static-site-hosting.en-US.md)
- [FAQ](./docs/faq.md)
- [Release Guide](./docs/release.en.md)

## License

MIT
