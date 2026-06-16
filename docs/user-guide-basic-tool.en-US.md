# Basic Tool User Guide

The Basic Tool edition is the local, self-configured version of this project. It is similar to the Static HTML edition, but startup and local saving behavior differ.

If you are a non-technical user and want the fastest path, start with the [Static HTML User Guide](user-guide-static-html.en-US.md).

## Choose an Edition

| Edition | Best for | Startup |
| --- | --- | --- |
| Static HTML | Quick GitHub user trial | Open `index.html` |
| Source web mode | Developers or command-line users | `npm run dev` |
| Desktop | Long-term local use | Installer or `npm run desktop:dev` |

The Basic Tool edition does not include registration, credits, platform-managed keys, payment, admin dashboard, server queues, or platform image storage.

## Source Web Mode Quick Start

Requirements:

- Node.js `>= 20.19.0`
- npm `>= 10`

Commands:

```powershell
npm install
npm run dev
```

Open the URL shown by Vite, usually:

```text
http://localhost:5173/
```

If port 5173 is already in use, close the old process or use the new port shown by Vite.

## Desktop Edition

The desktop edition is better for users who do not want to open a terminal every time.

Development run:

```powershell
npm run desktop:dev
```

Build installer:

```powershell
npm run desktop:build
```

Desktop mode usually provides a more native local saving experience than browser mode.

## Menu 1: Settings

Configure Settings before generation.

### Required Fields

- `API key`: your model provider key.
- `Base URL`: provider endpoint, preferably ending with `/v1`.
- Text model: prompt optimization, AI batch splitting, and text testing.
- Image model: text-to-image, image-to-image, and image testing.
- Timeout: 60 to 600 seconds. Use shorter values for quick 1K tests, and 180 to 300 seconds for slower image models or 2K/4K generation.

### Image Defaults

- Size: `auto`, 1K, 2K, 4K, or custom width and height.
- Count: 1 to 4.
- Quality: `auto`, `low`, `medium`, or `high`.
- Format: `png`, `jpeg`, or `webp`.
- Compression: applies only to `jpeg` and `webp`.

### Output Directory

In source web mode, images are usually saved by browser download or browser directory selection.

Desktop mode provides a more native and stable local output workflow.

### Test Connection

Recommended order:

1. Test text model.
2. Test image model.
3. If you need image-to-image, test image edit model.

Tests can fail while settings can still be saved. Use the error message to check provider status, key, model names, and network behavior.

## Menu 2: Generate

Generate is for a single image task.

### Text-to-Image

1. Enter the prompt.
2. Optionally enter a custom file name.
3. Optionally optimize the prompt.
4. Generate.
5. Wait for preview and local save.

### Image-to-Image and Multi-Image References

Upload or drag images, then enter the edit instruction. The current limit is 8 reference images, with 4 or fewer recommended.

Without reference images, the app calls `/images/generations`. With reference images, it calls `/images/edits`.

## Menu 3: Batch

Batch supports:

- Same prompt: create variants from one prompt.
- Multi-line prompts: one prompt per line.
- AI split: use the text model to split a master task into N sub-prompts.

Recommended conservative settings:

```text
Concurrency: 1
Interval seconds: 20 to 60
Max retries: 1
```

If your provider is stable, you may increase concurrency gradually. The current maximum is 3. If the provider returns a cost-risk failure, the batch may pause to avoid repeated waste.

Successful batch tasks are added to History, and a `manifest.json` file is saved.

## Menu 4: History

History records successful generation tasks. You can review prompts, model, size, duration, and output path, and reuse prompts.

Source web mode and Static HTML mode store history mainly in browser local storage. Old image preview recovery requires folder authorization in Settings plus a passing output-folder test; typing a path or seeing a folder name does not grant browser file access. Desktop mode is better for long-term local output management.

## About Prompt Templates

The current prompt-template feature is not a core workflow. It may be removed and rebuilt later as a clearer standalone menu.

For now, prefer:

- The Generate prompt input
- Batch AI split
- Custom split `systemPrompt`

## FAQ

### The page opens but generation fails

Check `API key`, `Base URL`, model names, provider status, and CORS for browser modes.

### Generation is slow

Image models can take a long time. Set timeout to 240 to 300 seconds and test with a smaller size.

### Provider returns 500, 524, or upstream error

This is usually a provider or upstream failure, not local app logic. Retrying may still cost money, so wait for recovery.

### Does the batch draft survive menu switching?

The current batch draft should remain locally available when switching menus. Use Clear current batch only when you want to reset it.

## Developer Verification

```powershell
npm run test:run
npm run build
npm run build:static
```

For desktop verification, Rust and Tauri are also required:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```
