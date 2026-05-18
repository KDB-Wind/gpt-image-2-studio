# Chat To Image Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight local image generation app with shared Web and Tauri desktop modes, local user configuration, optional prompt optimization, long-running image generation, local file saving, and date-sorted history.

**Architecture:** Use a shared React + TypeScript frontend and core module set. Keep provider API calls, filename logic, config validation, and history shaping in `src/core`, while `src/runtime` hides differences between browser storage/downloads and Tauri filesystem commands.

**Tech Stack:** Vite, React, TypeScript, Vitest, lucide-react, Tauri v2, Rust, serde, keyring, directories.

---

## References

- OpenAI image generation guide: `https://platform.openai.com/docs/guides/images/image-generation`
- OpenAI Responses API reference: `https://platform.openai.com/docs/api-reference/responses/create`
- Tauri Vite guide: `https://v2.tauri.app/start/frontend/vite/`
- Tauri dialog plugin: `https://v2.tauri.app/plugin/dialog/`
- Tauri opener plugin: `https://v2.tauri.app/plugin/opener/`

## File Structure

- Create `package.json`: npm scripts and frontend dependencies.
- Create `index.html`: Vite entry document.
- Create `vite.config.ts`: Vite React and Vitest config.
- Create `tsconfig.json`: TypeScript project config.
- Create `src/main.tsx`: React entry.
- Create `src/App.tsx`: top-level app composition and state orchestration.
- Create `src/styles.css`: complete responsive application styling.
- Create `src/core/config.ts`: defaults, config types, base URL normalization, validation.
- Create `src/core/config.test.ts`: unit tests for config behavior.
- Create `src/core/fileNames.ts`: date folder and filename generation helpers.
- Create `src/core/fileNames.test.ts`: unit tests for filename behavior.
- Create `src/core/apiClient.ts`: OpenAI-compatible text and image request layer.
- Create `src/core/apiClient.test.ts`: request builder and response parser tests.
- Create `src/core/history.ts`: image history types, grouping, serialization helpers.
- Create `src/core/history.test.ts`: history ordering and grouping tests.
- Create `src/runtime/types.ts`: runtime adapter interface.
- Create `src/runtime/webAdapter.ts`: browser storage, download, and optional File System Access saving.
- Create `src/runtime/tauriAdapter.ts`: Tauri command adapter.
- Create `src/runtime/index.ts`: runtime detection and adapter export.
- Create `src/types/file-system-access.d.ts`: browser File System Access API type declarations used by web mode.
- Create `src-tauri/Cargo.toml`: Rust app dependencies.
- Create `src-tauri/tauri.conf.json`: Tauri app config.
- Create `src-tauri/build.rs`: Tauri build hook.
- Create `src-tauri/src/main.rs`: Tauri entry.
- Create `src-tauri/src/lib.rs`: command registration.
- Create `src-tauri/src/models.rs`: shared Rust DTOs.
- Create `src-tauri/src/storage.rs`: config, secret, image, and history persistence.
- Create `src-tauri/src/storage_tests.rs`: Rust tests for persistence path helpers and filename collision behavior.
- Create `src-tauri/capabilities/default.json`: Tauri v2 capability permissions.
- Create `README.md`: local setup, web mode, desktop mode, configuration, and safety notes.
- Modify `.gitignore`: keep generated artifacts, local outputs, and env files out of Git.

## Implementation Tasks

### Task 1: Bootstrap Project

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`
- Create: `src-tauri/capabilities/default.json`
- Modify: `.gitignore`

- [ ] **Step 1: Install dependencies**

Run:

```powershell
npm init -y
npm install react react-dom lucide-react @tauri-apps/api @tauri-apps/plugin-dialog @tauri-apps/plugin-opener
npm install -D @vitejs/plugin-react vite typescript vitest jsdom @types/react @types/react-dom @tauri-apps/cli
```

Expected: `package-lock.json` is created and npm reports installed packages.

- [ ] **Step 2: Replace `package.json` scripts and metadata**

Use this complete shape:

```json
{
  "name": "chat-to-image",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest",
    "test:run": "vitest run",
    "tauri": "tauri",
    "desktop:dev": "tauri dev",
    "desktop:build": "tauri build"
  },
  "dependencies": {
    "@tauri-apps/api": "^2.0.0",
    "@tauri-apps/plugin-dialog": "^2.0.0",
    "@tauri-apps/plugin-opener": "^2.0.0",
    "lucide-react": "^0.468.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^5.0.0",
    "jsdom": "^25.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^2.1.0"
  }
}
```

After editing, run:

```powershell
npm install
```

Expected: lockfile is updated without peer dependency errors.

- [ ] **Step 3: Create frontend entry files**

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Chat To Image</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/main.tsx`:

```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

`src/App.tsx`:

```tsx
export default function App() {
  return (
    <main className="app-shell">
      <section className="workspace">
        <h1>Chat To Image</h1>
        <p>Local image generation workspace</p>
      </section>
    </main>
  );
}
```

`src/styles.css`:

```css
:root {
  color: #1d2329;
  background: #f3f0ea;
  font-family: "Aptos", "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
}

button,
input,
select,
textarea {
  font: inherit;
}

.app-shell {
  min-height: 100vh;
  padding: 24px;
  background:
    linear-gradient(135deg, rgba(226, 232, 220, 0.95), rgba(245, 241, 232, 0.95)),
    radial-gradient(circle at 20% 10%, rgba(81, 125, 111, 0.12), transparent 32%);
}

.workspace {
  max-width: 1280px;
  margin: 0 auto;
}
```

- [ ] **Step 4: Create TypeScript and Vite config**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src"],
  "references": []
}
```

`vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    strictPort: true,
    port: 5173,
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
});
```

- [ ] **Step 5: Create minimal Tauri shell**

`src-tauri/Cargo.toml`:

```toml
[package]
name = "chat-to-image"
version = "0.1.0"
description = "Local image generation workspace"
authors = ["Chat To Image"]
edition = "2021"

[lib]
name = "chat_to_image_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
base64 = "0.22"
chrono = { version = "0.4", features = ["serde"] }
directories = "5"
keyring = "3"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tauri = { version = "2", features = [] }
tauri-plugin-dialog = "2"
tauri-plugin-opener = "2"
thiserror = "2"
```

`src-tauri/build.rs`:

```rust
fn main() {
    tauri_build::build();
}
```

`src-tauri/src/main.rs`:

```rust
fn main() {
    chat_to_image_lib::run();
}
```

`src-tauri/src/lib.rs`:

```rust
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("failed to run Chat To Image");
}
```

`src-tauri/tauri.conf.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Chat To Image",
  "version": "0.1.0",
  "identifier": "dev.local.chat-to-image",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:5173",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "Chat To Image",
        "width": 1320,
        "height": 860,
        "minWidth": 980,
        "minHeight": 700
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": []
  }
}
```

`src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default permissions for Chat To Image",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "dialog:default",
    "opener:default"
  ]
}
```

- [ ] **Step 6: Update `.gitignore`**

Ensure it contains:

```gitignore
.superpowers/
node_modules/
dist/
dist-ssr/
src-tauri/target/
outputs/
.env
.env.*
!.env.example
```

- [ ] **Step 7: Verify scaffold**

Run:

```powershell
npm run build
```

Expected: Vite builds successfully and writes `dist/`.

Run:

```powershell
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: Rust project checks successfully.

- [ ] **Step 8: Commit scaffold**

Run:

```powershell
git add .gitignore package.json package-lock.json index.html vite.config.ts tsconfig.json src src-tauri
git commit -m "chore: scaffold tauri vite app"
```

Expected: commit succeeds.

### Task 2: Core Configuration

**Files:**
- Create: `src/core/config.ts`
- Create: `src/core/config.test.ts`

- [ ] **Step 1: Write failing config tests**

`src/core/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  normalizeBaseUrl,
  validateConfig,
  type AppConfig,
} from "./config";

describe("normalizeBaseUrl", () => {
  it("adds /v1 when the user enters the host only", () => {
    expect(normalizeBaseUrl("https://ruoli.dev")).toBe("https://ruoli.dev/v1");
  });

  it("keeps an existing /v1 suffix", () => {
    expect(normalizeBaseUrl("https://ruoli.dev/v1")).toBe("https://ruoli.dev/v1");
  });

  it("removes trailing slashes before normalizing", () => {
    expect(normalizeBaseUrl("https://ruoli.dev///")).toBe("https://ruoli.dev/v1");
  });
});

describe("validateConfig", () => {
  const valid: AppConfig = {
    ...DEFAULT_CONFIG,
    apiKey: "sk-local",
  };

  it("accepts the default ruoli.dev settings when an API key is present", () => {
    expect(validateConfig(valid).errors).toEqual([]);
  });

  it("requires an API key before network calls", () => {
    expect(validateConfig({ ...valid, apiKey: "" }).errors).toContain("API key is required.");
  });

  it("requires a timeout of at least 180 seconds", () => {
    expect(validateConfig({ ...valid, timeoutSeconds: 120 }).errors).toContain(
      "Timeout must be at least 180 seconds.",
    );
  });

  it("requires model names", () => {
    const result = validateConfig({ ...valid, textModel: "", imageModel: "" });
    expect(result.errors).toContain("Text model is required.");
    expect(result.errors).toContain("Image model is required.");
  });

  it("warns but does not error when output directory is empty", () => {
    const result = validateConfig({ ...valid, outputDirectory: "" });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toContain("Output directory is empty; the app will use outputs/.");
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
npm run test:run -- src/core/config.test.ts
```

Expected: FAIL because `src/core/config.ts` does not exist.

- [ ] **Step 3: Implement config core**

`src/core/config.ts`:

```ts
export type AppConfig = {
  baseUrl: string;
  apiKey: string;
  textModel: string;
  imageModel: string;
  timeoutSeconds: number;
  outputDirectory: string;
  defaultSize: string;
  defaultCount: number;
  defaultQuality: string;
  defaultFormat: "png" | "jpeg" | "webp";
};

export type ValidationResult = {
  errors: string[];
  warnings: string[];
};

export const DEFAULT_CONFIG: AppConfig = {
  baseUrl: "https://ruoli.dev/v1",
  apiKey: "",
  textModel: "gpt-5.4-mini",
  imageModel: "gpt-image-2",
  timeoutSeconds: 180,
  outputDirectory: "outputs",
  defaultSize: "1024x1024",
  defaultCount: 1,
  defaultQuality: "auto",
  defaultFormat: "png",
};

export function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/v1")) {
    return trimmed;
  }
  return `${trimmed}/v1`;
}

export function mergeConfig(value: Partial<AppConfig> | null | undefined): AppConfig {
  return {
    ...DEFAULT_CONFIG,
    ...(value ?? {}),
  };
}

export function validateConfig(config: AppConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    new URL(normalizeBaseUrl(config.baseUrl));
  } catch {
    errors.push("Base URL must be a valid URL.");
  }

  if (!config.apiKey.trim()) {
    errors.push("API key is required.");
  }

  if (!config.textModel.trim()) {
    errors.push("Text model is required.");
  }

  if (!config.imageModel.trim()) {
    errors.push("Image model is required.");
  }

  if (!Number.isFinite(config.timeoutSeconds) || config.timeoutSeconds < 180) {
    errors.push("Timeout must be at least 180 seconds.");
  }

  if (!Number.isInteger(config.defaultCount) || config.defaultCount < 1 || config.defaultCount > 4) {
    errors.push("Image count must be between 1 and 4.");
  }

  if (!config.outputDirectory.trim()) {
    warnings.push("Output directory is empty; the app will use outputs/.");
  }

  return { errors, warnings };
}
```

- [ ] **Step 4: Run config tests**

Run:

```powershell
npm run test:run -- src/core/config.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit config core**

Run:

```powershell
git add src/core/config.ts src/core/config.test.ts
git commit -m "feat: add configuration core"
```

Expected: commit succeeds.

### Task 3: Filename And Output Path Core

**Files:**
- Create: `src/core/fileNames.ts`
- Create: `src/core/fileNames.test.ts`

- [ ] **Step 1: Write failing filename tests**

`src/core/fileNames.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildImageFileName,
  buildOutputPath,
  sanitizeFileBaseName,
  summarizePrompt,
} from "./fileNames";

const generatedAt = new Date("2026-04-30T13:15:08.000Z");

describe("sanitizeFileBaseName", () => {
  it("removes forbidden cross-platform filename characters", () => {
    expect(sanitizeFileBaseName('a<b>c:d"e/f\\\\g|h?i*j')).toBe("a-b-c-d-e-f-g-h-i-j");
  });

  it("uses image when the result is empty", () => {
    expect(sanitizeFileBaseName("////")).toBe("image");
  });
});

describe("summarizePrompt", () => {
  it("creates a short lowercase slug", () => {
    expect(summarizePrompt("A Sunset City, cinematic light!!")).toBe("a-sunset-city-cinematic-light");
  });

  it("limits prompt summaries", () => {
    expect(summarizePrompt("one two three four five six seven eight nine ten")).toBe(
      "one-two-three-four-five-six-seven-eight",
    );
  });
});

describe("buildImageFileName", () => {
  it("uses custom names when present", () => {
    expect(
      buildImageFileName({
        prompt: "ignored",
        customName: "cover art",
        extension: "png",
        generatedAt,
        existingNames: [],
      }),
    ).toBe("cover-art.png");
  });

  it("uses time and prompt summary when custom name is empty", () => {
    expect(
      buildImageFileName({
        prompt: "Sunset city",
        customName: "",
        extension: "png",
        generatedAt,
        existingNames: [],
      }),
    ).toBe("21-15-08_sunset-city.png");
  });

  it("adds a suffix on collision", () => {
    expect(
      buildImageFileName({
        prompt: "Sunset city",
        customName: "cover",
        extension: "png",
        generatedAt,
        existingNames: ["cover.png", "cover-2.png"],
      }),
    ).toBe("cover-3.png");
  });
});

describe("buildOutputPath", () => {
  it("uses a date folder", () => {
    expect(buildOutputPath("outputs", generatedAt, "cover.png")).toBe(
      "outputs/2026-04-30/cover.png",
    );
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
npm run test:run -- src/core/fileNames.test.ts
```

Expected: FAIL because `src/core/fileNames.ts` does not exist.

- [ ] **Step 3: Implement filename helpers**

`src/core/fileNames.ts`:

```ts
export type BuildImageFileNameInput = {
  prompt: string;
  customName: string;
  extension: "png" | "jpeg" | "webp";
  generatedAt: Date;
  existingNames: string[];
};

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

export function formatDateFolder(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatLocalTime(date: Date): string {
  return `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

export function sanitizeFileBaseName(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .replace(/[.\s-]+$/g, "")
    .toLowerCase()
    .slice(0, 80);

  return sanitized || "image";
}

export function summarizePrompt(prompt: string): string {
  const words = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);

  return sanitizeFileBaseName(words.join("-"));
}

export function buildImageFileName(input: BuildImageFileNameInput): string {
  const extension = input.extension === "jpeg" ? "jpg" : input.extension;
  const base = input.customName.trim()
    ? sanitizeFileBaseName(input.customName)
    : `${formatLocalTime(input.generatedAt)}_${summarizePrompt(input.prompt)}`;
  const existing = new Set(input.existingNames.map((name) => name.toLowerCase()));
  let candidate = `${base}.${extension}`;
  let index = 2;

  while (existing.has(candidate.toLowerCase())) {
    candidate = `${base}-${index}.${extension}`;
    index += 1;
  }

  return candidate;
}

export function buildOutputPath(outputDirectory: string, generatedAt: Date, fileName: string): string {
  const base = outputDirectory.trim().replace(/[\\/]+$/g, "") || "outputs";
  return `${base}/${formatDateFolder(generatedAt)}/${fileName}`;
}
```

- [ ] **Step 4: Run filename tests**

Run:

```powershell
npm run test:run -- src/core/fileNames.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit filename core**

Run:

```powershell
git add src/core/fileNames.ts src/core/fileNames.test.ts
git commit -m "feat: add image filename rules"
```

Expected: commit succeeds.

### Task 4: API Client Core

**Files:**
- Create: `src/core/apiClient.ts`
- Create: `src/core/apiClient.test.ts`
- Modify: `src/core/config.ts`

- [ ] **Step 1: Write failing API tests**

`src/core/apiClient.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "./config";
import {
  buildChatCompletionsRequest,
  buildImageGenerationRequest,
  buildResponsesRequest,
  parseImageGenerationResponse,
  parseTextResponse,
  requestJsonWithTimeout,
} from "./apiClient";

describe("request builders", () => {
  it("builds a Responses API request for text", () => {
    expect(
      buildResponsesRequest({
        model: "gpt-5.4-mini",
        input: "Reply OK",
      }),
    ).toEqual({
      model: "gpt-5.4-mini",
      input: "Reply OK",
    });
  });

  it("builds a chat completions fallback request", () => {
    expect(
      buildChatCompletionsRequest({
        model: "gpt-5.4-mini",
        system: "Be brief.",
        user: "Reply OK",
      }),
    ).toEqual({
      model: "gpt-5.4-mini",
      messages: [
        { role: "system", content: "Be brief." },
        { role: "user", content: "Reply OK" },
      ],
    });
  });

  it("builds an image generation request", () => {
    expect(
      buildImageGenerationRequest({
        model: "gpt-image-2",
        prompt: "A quiet studio",
        size: "1024x1024",
        quality: "auto",
        n: 1,
        outputFormat: "png",
      }),
    ).toEqual({
      model: "gpt-image-2",
      prompt: "A quiet studio",
      size: "1024x1024",
      quality: "auto",
      n: 1,
      output_format: "png",
    });
  });
});

describe("response parsers", () => {
  it("parses Responses API output text", () => {
    expect(parseTextResponse({ output_text: "OK" })).toBe("OK");
  });

  it("parses chat completions output text", () => {
    expect(parseTextResponse({ choices: [{ message: { content: "OK" } }] })).toBe("OK");
  });

  it("parses base64 image responses", () => {
    expect(parseImageGenerationResponse({ data: [{ b64_json: "abc" }] })).toEqual([
      { kind: "base64", value: "abc" },
    ]);
  });

  it("parses URL image responses", () => {
    expect(parseImageGenerationResponse({ data: [{ url: "https://example.test/a.png" }] })).toEqual([
      { kind: "url", value: "https://example.test/a.png" },
    ]);
  });
});

describe("requestJsonWithTimeout", () => {
  it("aborts requests after the configured timeout", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    });

    const promise = requestJsonWithTimeout({
      url: "https://ruoli.dev/v1/responses",
      apiKey: DEFAULT_CONFIG.apiKey,
      body: { model: "x", input: "y" },
      timeoutSeconds: 180,
      fetcher,
    });

    await vi.advanceTimersByTimeAsync(180_000);
    await expect(promise).rejects.toThrow("Request timed out after 180 seconds.");
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
npm run test:run -- src/core/apiClient.test.ts
```

Expected: FAIL because `src/core/apiClient.ts` does not exist.

- [ ] **Step 3: Implement API client**

`src/core/apiClient.ts`:

```ts
import { normalizeBaseUrl, type AppConfig } from "./config";

export type TextRequestInput = {
  model: string;
  input: string;
};

export type ChatRequestInput = {
  model: string;
  system: string;
  user: string;
};

export type ImageRequestInput = {
  model: string;
  prompt: string;
  size: string;
  quality: string;
  n: number;
  outputFormat: "png" | "jpeg" | "webp";
};

export type ParsedImage = {
  kind: "base64" | "url";
  value: string;
};

export type RequestJsonInput = {
  url: string;
  apiKey: string;
  body: unknown;
  timeoutSeconds: number;
  fetcher?: typeof fetch;
};

export function buildResponsesRequest(input: TextRequestInput) {
  return {
    model: input.model,
    input: input.input,
  };
}

export function buildChatCompletionsRequest(input: ChatRequestInput) {
  return {
    model: input.model,
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.user },
    ],
  };
}

export function buildImageGenerationRequest(input: ImageRequestInput) {
  return {
    model: input.model,
    prompt: input.prompt,
    size: input.size,
    quality: input.quality,
    n: input.n,
    output_format: input.outputFormat,
  };
}

export function parseTextResponse(value: unknown): string {
  const response = value as {
    output_text?: string;
    choices?: Array<{ message?: { content?: string } }>;
  };

  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const content = response.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }

  throw new Error("Text response did not contain output text.");
}

export function parseImageGenerationResponse(value: unknown): ParsedImage[] {
  const response = value as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };

  const images =
    response.data?.flatMap((item): ParsedImage[] => {
      if (typeof item.b64_json === "string" && item.b64_json) {
        return [{ kind: "base64", value: item.b64_json }];
      }
      if (typeof item.url === "string" && item.url) {
        return [{ kind: "url", value: item.url }];
      }
      return [];
    }) ?? [];

  if (images.length === 0) {
    throw new Error("Image response did not contain image data.");
  }

  return images;
}

export async function requestJsonWithTimeout(input: RequestJsonInput): Promise<unknown> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), input.timeoutSeconds * 1000);
  const fetcher = input.fetcher ?? fetch;

  try {
    const response = await fetcher(input.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input.body),
      signal: controller.signal,
    });

    const text = await response.text();
    const json = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const message =
        typeof json?.error?.message === "string"
          ? json.error.message
          : `Request failed with HTTP ${response.status}.`;
      throw new Error(message);
    }

    return json;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Request timed out after ${input.timeoutSeconds} seconds.`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function sendTextRequest(config: AppConfig, system: string, user: string): Promise<string> {
  const baseUrl = normalizeBaseUrl(config.baseUrl);

  try {
    const responsesJson = await requestJsonWithTimeout({
      url: `${baseUrl}/responses`,
      apiKey: config.apiKey,
      timeoutSeconds: config.timeoutSeconds,
      body: buildResponsesRequest({
        model: config.textModel,
        input: `${system}\n\n${user}`,
      }),
    });
    return parseTextResponse(responsesJson);
  } catch (error) {
    const chatJson = await requestJsonWithTimeout({
      url: `${baseUrl}/chat/completions`,
      apiKey: config.apiKey,
      timeoutSeconds: config.timeoutSeconds,
      body: buildChatCompletionsRequest({
        model: config.textModel,
        system,
        user,
      }),
    });
    return parseTextResponse(chatJson);
  }
}

export async function testTextModel(config: AppConfig): Promise<string> {
  return sendTextRequest(config, "Reply with OK only.", "OK");
}

export async function optimizePrompt(config: AppConfig, prompt: string): Promise<string> {
  return sendTextRequest(
    config,
    "Rewrite the user's prompt into a concise, vivid image-generation prompt. Preserve the user's intent. Return only the improved prompt.",
    prompt,
  );
}

export async function testImageModel(config: AppConfig): Promise<ParsedImage[]> {
  return generateImages(config, "A small plain color swatch used only for an image model connectivity test.");
}

export async function generateImages(config: AppConfig, prompt: string): Promise<ParsedImage[]> {
  const json = await requestJsonWithTimeout({
    url: `${normalizeBaseUrl(config.baseUrl)}/images/generations`,
    apiKey: config.apiKey,
    timeoutSeconds: config.timeoutSeconds,
    body: buildImageGenerationRequest({
      model: config.imageModel,
      prompt,
      size: config.defaultSize,
      quality: config.defaultQuality,
      n: config.defaultCount,
      outputFormat: config.defaultFormat,
    }),
  });

  return parseImageGenerationResponse(json);
}
```

- [ ] **Step 4: Run API tests**

Run:

```powershell
npm run test:run -- src/core/apiClient.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit API core**

Run:

```powershell
git add src/core/apiClient.ts src/core/apiClient.test.ts
git commit -m "feat: add openai compatible api client"
```

Expected: commit succeeds.

### Task 5: History Core

**Files:**
- Create: `src/core/history.ts`
- Create: `src/core/history.test.ts`

- [ ] **Step 1: Write failing history tests**

`src/core/history.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { groupHistoryByDate, sortHistoryNewestFirst, type ImageRecord } from "./history";

const records: ImageRecord[] = [
  {
    id: "old",
    status: "success",
    createdAt: "2026-04-29T10:00:00.000Z",
    prompt: "old prompt",
    optimizedPrompt: "",
    model: "gpt-image-2",
    size: "1024x1024",
    outputPath: "outputs/2026-04-29/old.png",
    durationMs: 120000,
  },
  {
    id: "new",
    status: "success",
    createdAt: "2026-04-30T10:00:00.000Z",
    prompt: "new prompt",
    optimizedPrompt: "new optimized prompt",
    model: "gpt-image-2",
    size: "1024x1024",
    outputPath: "outputs/2026-04-30/new.png",
    durationMs: 130000,
  },
];

describe("sortHistoryNewestFirst", () => {
  it("sorts newest first without mutating input", () => {
    const sorted = sortHistoryNewestFirst(records);
    expect(sorted.map((record) => record.id)).toEqual(["new", "old"]);
    expect(records.map((record) => record.id)).toEqual(["old", "new"]);
  });
});

describe("groupHistoryByDate", () => {
  it("groups records by local date label", () => {
    expect(groupHistoryByDate(records)).toEqual([
      { date: "2026-04-30", records: [records[1]] },
      { date: "2026-04-29", records: [records[0]] },
    ]);
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
npm run test:run -- src/core/history.test.ts
```

Expected: FAIL because `src/core/history.ts` does not exist.

- [ ] **Step 3: Implement history core**

`src/core/history.ts`:

```ts
import { formatDateFolder } from "./fileNames";

export type ImageRecordStatus = "success" | "failed" | "cancelled";

export type ImageRecord = {
  id: string;
  status: ImageRecordStatus;
  createdAt: string;
  prompt: string;
  optimizedPrompt: string;
  model: string;
  size: string;
  outputPath: string;
  durationMs: number;
  errorMessage?: string;
};

export type HistoryGroup = {
  date: string;
  records: ImageRecord[];
};

export function sortHistoryNewestFirst(records: ImageRecord[]): ImageRecord[] {
  return [...records].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

export function groupHistoryByDate(records: ImageRecord[]): HistoryGroup[] {
  const groups = new Map<string, ImageRecord[]>();

  for (const record of sortHistoryNewestFirst(records)) {
    const date = formatDateFolder(new Date(record.createdAt));
    groups.set(date, [...(groups.get(date) ?? []), record]);
  }

  return [...groups.entries()].map(([date, groupedRecords]) => ({
    date,
    records: groupedRecords,
  }));
}
```

- [ ] **Step 4: Run history tests**

Run:

```powershell
npm run test:run -- src/core/history.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit history core**

Run:

```powershell
git add src/core/history.ts src/core/history.test.ts
git commit -m "feat: add image history core"
```

Expected: commit succeeds.

### Task 6: Runtime Adapter Interfaces And Web Adapter

**Files:**
- Create: `src/runtime/types.ts`
- Create: `src/runtime/webAdapter.ts`
- Create: `src/runtime/index.ts`
- Create: `src/types/file-system-access.d.ts`

- [ ] **Step 1: Create runtime interface**

`src/runtime/types.ts`:

```ts
import type { AppConfig } from "../core/config";
import type { ImageRecord } from "../core/history";
import type { ParsedImage } from "../core/apiClient";

export type SaveImageInput = {
  image: ParsedImage;
  prompt: string;
  optimizedPrompt: string;
  customName: string;
  config: AppConfig;
  generatedAt: Date;
  durationMs: number;
};

export type SaveImageResult = {
  record: ImageRecord;
  previewUrl: string;
};

export type RuntimeAdapter = {
  mode: "web" | "desktop";
  loadConfig(): Promise<AppConfig>;
  saveConfig(config: AppConfig): Promise<void>;
  loadHistory(): Promise<ImageRecord[]>;
  saveImage(input: SaveImageInput): Promise<SaveImageResult>;
  chooseOutputDirectory(): Promise<string | null>;
  openOutputPath(path: string): Promise<void>;
};
```

- [ ] **Step 2: Add File System Access declarations**

`src/types/file-system-access.d.ts`:

```ts
interface FileSystemWritableFileStream extends WritableStream {
  write(data: BufferSource | Blob | string): Promise<void>;
  close(): Promise<void>;
}

interface FileSystemFileHandle {
  createWritable(): Promise<FileSystemWritableFileStream>;
}

interface FileSystemDirectoryHandle {
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
}

interface Window {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
}
```

- [ ] **Step 3: Implement web adapter**

`src/runtime/webAdapter.ts`:

```ts
import { DEFAULT_CONFIG, mergeConfig, type AppConfig } from "../core/config";
import { buildImageFileName, buildOutputPath } from "../core/fileNames";
import { sortHistoryNewestFirst, type ImageRecord } from "../core/history";
import type { RuntimeAdapter, SaveImageInput, SaveImageResult } from "./types";

const CONFIG_KEY = "chat-to-image.config.v1";
const HISTORY_KEY = "chat-to-image.history.v1";

let directoryHandle: FileSystemDirectoryHandle | null = null;

function imageToBlob(input: SaveImageInput): Blob {
  if (input.image.kind === "base64") {
    const binary = atob(input.image.value);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new Blob([bytes], { type: `image/${input.config.defaultFormat}` });
  }

  throw new Error("URL image saving requires downloading the image first.");
}

async function imageUrlToBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download generated image: HTTP ${response.status}.`);
  }
  return response.blob();
}

function downloadBlob(blob: Blob, fileName: string): string {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  return url;
}

export const webAdapter: RuntimeAdapter = {
  mode: "web",

  async loadConfig() {
    const raw = localStorage.getItem(CONFIG_KEY);
    return mergeConfig(raw ? JSON.parse(raw) : DEFAULT_CONFIG);
  },

  async saveConfig(config: AppConfig) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  },

  async loadHistory() {
    const raw = localStorage.getItem(HISTORY_KEY);
    return sortHistoryNewestFirst(raw ? JSON.parse(raw) : []);
  },

  async chooseOutputDirectory() {
    if (!window.showDirectoryPicker) {
      return null;
    }
    directoryHandle = await window.showDirectoryPicker();
    return "browser-selected-directory";
  },

  async saveImage(input: SaveImageInput): Promise<SaveImageResult> {
    const history = await this.loadHistory();
    const existingNames = history.map((record) => record.outputPath.split(/[\\/]/).pop() ?? "");
    const fileName = buildImageFileName({
      prompt: input.prompt,
      customName: input.customName,
      extension: input.config.defaultFormat,
      generatedAt: input.generatedAt,
      existingNames,
    });
    const outputPath = buildOutputPath(input.config.outputDirectory, input.generatedAt, fileName);
    const blob = input.image.kind === "base64" ? imageToBlob(input) : await imageUrlToBlob(input.image.value);
    let previewUrl: string;

    if (directoryHandle) {
      const dateFolderName = outputPath.split("/").at(-2) ?? "";
      const dateDirectory = await directoryHandle.getDirectoryHandle(dateFolderName, { create: true });
      const fileHandle = await dateDirectory.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      previewUrl = URL.createObjectURL(blob);
    } else {
      previewUrl = downloadBlob(blob, fileName);
    }

    const record: ImageRecord = {
      id: crypto.randomUUID(),
      status: "success",
      createdAt: input.generatedAt.toISOString(),
      prompt: input.prompt,
      optimizedPrompt: input.optimizedPrompt,
      model: input.config.imageModel,
      size: input.config.defaultSize,
      outputPath,
      durationMs: input.durationMs,
    };

    localStorage.setItem(HISTORY_KEY, JSON.stringify(sortHistoryNewestFirst([record, ...history])));
    return { record, previewUrl };
  },

  async openOutputPath() {
    return;
  },
};
```

- [ ] **Step 4: Implement runtime detection**

`src/runtime/index.ts`:

```ts
import type { RuntimeAdapter } from "./types";
import { webAdapter } from "./webAdapter";

export async function getRuntimeAdapter(): Promise<RuntimeAdapter> {
  if ("__TAURI_INTERNALS__" in window) {
    const { tauriAdapter } = await import("./tauriAdapter");
    return tauriAdapter;
  }

  return webAdapter;
}
```

- [ ] **Step 5: Run TypeScript build**

Run:

```powershell
npm run build
```

Expected: FAIL because `src/runtime/tauriAdapter.ts` is referenced but not created. This confirms the runtime boundary is connected.

- [ ] **Step 6: Commit web runtime after Task 7 creates Tauri adapter**

Do not commit this task alone. Commit together with Task 7 after TypeScript passes.

### Task 7: Tauri Runtime Commands And Adapter

**Files:**
- Create: `src/runtime/tauriAdapter.ts`
- Create: `src-tauri/src/models.rs`
- Create: `src-tauri/src/storage.rs`
- Create: `src-tauri/src/storage_tests.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Implement Tauri TypeScript adapter**

`src/runtime/tauriAdapter.ts`:

```ts
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import type { AppConfig } from "../core/config";
import type { ImageRecord } from "../core/history";
import type { RuntimeAdapter, SaveImageInput, SaveImageResult } from "./types";

async function urlToBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download generated image: HTTP ${response.status}.`);
  }
  const blob = await response.blob();
  const buffer = await blob.arrayBuffer();
  let binary = "";
  for (const byte of new Uint8Array(buffer)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

async function imagePayload(input: SaveImageInput) {
  const value = input.image.kind === "url" ? await urlToBase64(input.image.value) : input.image.value;

  return {
    kind: "base64",
    value,
    prompt: input.prompt,
    optimizedPrompt: input.optimizedPrompt,
    customName: input.customName,
    config: input.config,
    generatedAt: input.generatedAt.toISOString(),
    durationMs: input.durationMs,
  };
}

export const tauriAdapter: RuntimeAdapter = {
  mode: "desktop",

  loadConfig() {
    return invoke<AppConfig>("load_config");
  },

  saveConfig(config: AppConfig) {
    return invoke<void>("save_config", { config });
  },

  loadHistory() {
    return invoke<ImageRecord[]>("load_history");
  },

  async saveImage(input: SaveImageInput): Promise<SaveImageResult> {
    const result = await invoke<SaveImageResult>("save_generated_image", { input: await imagePayload(input) });
    return {
      ...result,
      previewUrl: convertFileSrc(result.record.outputPath),
    };
  },

  async chooseOutputDirectory() {
    const selected = await open({ directory: true, multiple: false });
    return typeof selected === "string" ? selected : null;
  },

  async openOutputPath(path: string) {
    await openPath(path);
  },
};
```

- [ ] **Step 2: Create Rust models**

`src-tauri/src/models.rs`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub base_url: String,
    pub api_key: String,
    pub text_model: String,
    pub image_model: String,
    pub timeout_seconds: u64,
    pub output_directory: String,
    pub default_size: String,
    pub default_count: u8,
    pub default_quality: String,
    pub default_format: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageRecord {
    pub id: String,
    pub status: String,
    pub created_at: String,
    pub prompt: String,
    pub optimized_prompt: String,
    pub model: String,
    pub size: String,
    pub output_path: String,
    pub duration_ms: u64,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveGeneratedImageInput {
    pub kind: String,
    pub value: String,
    pub prompt: String,
    pub optimized_prompt: String,
    pub custom_name: String,
    pub config: AppConfig,
    pub generated_at: String,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveImageResult {
    pub record: ImageRecord,
    pub preview_url: String,
}
```

- [ ] **Step 3: Create Rust storage commands**

`src-tauri/src/storage.rs`:

```rust
use crate::models::{AppConfig, ImageRecord, SaveGeneratedImageInput, SaveImageResult};
use base64::Engine;
use chrono::{DateTime, Local};
use directories::ProjectDirs;
use keyring::Entry;
use serde::{de::DeserializeOwned, Serialize};
use std::{fs, path::{Path, PathBuf}};
use tauri::Manager;

const SERVICE_NAME: &str = "chat-to-image";
const SECRET_USER: &str = "default";

fn default_config() -> AppConfig {
    AppConfig {
        base_url: "https://ruoli.dev/v1".to_string(),
        api_key: "".to_string(),
        text_model: "gpt-5.4-mini".to_string(),
        image_model: "gpt-image-2".to_string(),
        timeout_seconds: 180,
        output_directory: "outputs".to_string(),
        default_size: "1024x1024".to_string(),
        default_count: 1,
        default_quality: "auto".to_string(),
        default_format: "png".to_string(),
    }
}

fn project_dirs() -> Result<ProjectDirs, String> {
    ProjectDirs::from("dev", "local", "Chat To Image")
        .ok_or_else(|| "Unable to resolve application data directory.".to_string())
}

fn config_path() -> Result<PathBuf, String> {
    Ok(project_dirs()?.config_dir().join("config.json"))
}

fn history_path() -> Result<PathBuf, String> {
    Ok(project_dirs()?.data_dir().join("history.json"))
}

fn ensure_parent(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn read_json<T: DeserializeOwned>(path: &Path) -> Result<Option<T>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let value = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&value).map(Some).map_err(|error| error.to_string())
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    ensure_parent(path)?;
    let json = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
    fs::write(path, json).map_err(|error| error.to_string())
}

fn read_api_key_fallback(path: &Path) -> String {
    read_json::<serde_json::Value>(path)
        .ok()
        .flatten()
        .and_then(|value| value.get("apiKey").and_then(|key| key.as_str()).map(ToString::to_string))
        .unwrap_or_default()
}

fn load_api_key(path: &Path) -> String {
    Entry::new(SERVICE_NAME, SECRET_USER)
        .and_then(|entry| entry.get_password())
        .unwrap_or_else(|_| read_api_key_fallback(path))
}

fn save_api_key(api_key: &str, path: &Path) -> Result<(), String> {
    match Entry::new(SERVICE_NAME, SECRET_USER).and_then(|entry| entry.set_password(api_key)) {
        Ok(_) => Ok(()),
        Err(_) => {
            let mut value = serde_json::to_value(read_json::<AppConfig>(path)?.unwrap_or_else(default_config))
                .map_err(|error| error.to_string())?;
            value["apiKey"] = serde_json::Value::String(api_key.to_string());
            write_json(path, &value)
        }
    }
}

#[tauri::command]
pub fn load_config() -> Result<AppConfig, String> {
    let path = config_path()?;
    let mut config = read_json::<AppConfig>(&path)?.unwrap_or_else(default_config);
    config.api_key = load_api_key(&path);
    Ok(config)
}

#[tauri::command]
pub fn save_config(mut config: AppConfig) -> Result<(), String> {
    let path = config_path()?;
    save_api_key(&config.api_key, &path)?;
    config.api_key.clear();
    write_json(&path, &config)
}

#[tauri::command]
pub fn load_history() -> Result<Vec<ImageRecord>, String> {
    let path = history_path()?;
    Ok(read_json::<Vec<ImageRecord>>(&path)?.unwrap_or_default())
}

pub(crate) fn sanitize_file_base_name(value: &str) -> String {
    let mut output = value
        .trim()
        .chars()
        .map(|ch| if r#"<>:"/\|?*"#.contains(ch) || ch.is_control() { '-' } else { ch })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join("-");

    while output.contains("--") {
        output = output.replace("--", "-");
    }

    let output = output.trim_matches(['.', ' ', '-']).to_lowercase();
    if output.is_empty() { "image".to_string() } else { output.chars().take(80).collect() }
}

fn date_folder(generated_at: &str) -> Result<String, String> {
    let parsed = DateTime::parse_from_rfc3339(generated_at).map_err(|error| error.to_string())?;
    Ok(parsed.with_timezone(&Local).format("%Y-%m-%d").to_string())
}

fn time_part(generated_at: &str) -> Result<String, String> {
    let parsed = DateTime::parse_from_rfc3339(generated_at).map_err(|error| error.to_string())?;
    Ok(parsed.with_timezone(&Local).format("%H-%M-%S").to_string())
}

pub(crate) fn prompt_summary(prompt: &str) -> String {
    let words = prompt
        .split(|ch: char| !ch.is_alphanumeric())
        .filter(|part| !part.is_empty())
        .take(8)
        .collect::<Vec<_>>()
        .join("-");
    sanitize_file_base_name(&words)
}

pub(crate) fn unique_file_name(base: &str, extension: &str, directory: &Path) -> String {
    let normalized_extension = if extension == "jpeg" { "jpg" } else { extension };
    let mut candidate = format!("{base}.{normalized_extension}");
    let mut index = 2;

    while directory.join(&candidate).exists() {
        candidate = format!("{base}-{index}.{normalized_extension}");
        index += 1;
    }

    candidate
}

#[tauri::command]
pub fn save_generated_image(input: SaveGeneratedImageInput) -> Result<SaveImageResult, String> {
    let output_root = if input.config.output_directory.trim().is_empty() {
        PathBuf::from("outputs")
    } else {
        PathBuf::from(input.config.output_directory.trim())
    };
    let folder = output_root.join(date_folder(&input.generated_at)?);
    fs::create_dir_all(&folder).map_err(|error| error.to_string())?;

    let base = if input.custom_name.trim().is_empty() {
        format!("{}_{}", time_part(&input.generated_at)?, prompt_summary(&input.prompt))
    } else {
        sanitize_file_base_name(&input.custom_name)
    };
    let file_name = unique_file_name(&base, &input.config.default_format, &folder);
    let output_path = folder.join(file_name);

    if input.kind == "base64" {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(input.value)
            .map_err(|error| error.to_string())?;
        fs::write(&output_path, bytes).map_err(|error| error.to_string())?;
    } else {
        return Err("Desktop URL image saving is handled by the frontend fetch path in this version.".to_string());
    }

    let mut history = load_history()?;
    let record = ImageRecord {
        id: uuid_like(),
        status: "success".to_string(),
        created_at: input.generated_at,
        prompt: input.prompt,
        optimized_prompt: input.optimized_prompt,
        model: input.config.image_model,
        size: input.config.default_size,
        output_path: output_path.to_string_lossy().to_string(),
        duration_ms: input.duration_ms,
        error_message: None,
    };
    history.insert(0, record.clone());
    write_json(&history_path()?, &history)?;

    Ok(SaveImageResult {
        preview_url: output_path.to_string_lossy().to_string(),
        record,
    })
}

fn uuid_like() -> String {
    format!("{}-{}", chrono::Utc::now().timestamp_millis(), std::process::id())
}
```

- [ ] **Step 4: Register commands**

Modify `src-tauri/src/lib.rs`:

```rust
mod models;
mod storage;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            storage::load_config,
            storage::save_config,
            storage::load_history,
            storage::save_generated_image,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Chat To Image");
}
```

- [ ] **Step 5: Add Rust storage tests**

`src-tauri/src/storage_tests.rs`:

```rust
#[test]
fn sanitizes_cross_platform_file_names() {
    assert_eq!(
        crate::storage::sanitize_file_base_name("a<b>c:d/e\\\\f|g?h*i"),
        "a-b-c-d-e-f-g-h-i"
    );
}

#[test]
fn summarizes_prompt_with_eight_terms() {
    assert_eq!(
        crate::storage::prompt_summary("one two three four five six seven eight nine ten"),
        "one-two-three-four-five-six-seven-eight"
    );
}
```

Modify `src-tauri/src/lib.rs` to include tests:

```rust
mod models;
mod storage;

#[cfg(test)]
mod storage_tests;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            storage::load_config,
            storage::save_config,
            storage::load_history,
            storage::save_generated_image,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Chat To Image");
}
```

- [ ] **Step 6: Run frontend and Rust checks**

Run:

```powershell
npm run build
```

Expected: PASS.

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: PASS.

- [ ] **Step 7: Commit runtime adapters**

Run:

```powershell
git add src/runtime src/types src-tauri
git commit -m "feat: add runtime adapters"
```

Expected: commit succeeds.

### Task 8: Application UI And Workflow

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Replace `src/App.tsx` with full workflow UI**

Use this component structure:

```tsx
import {
  AlertCircle,
  CheckCircle2,
  FolderOpen,
  ImageIcon,
  Loader2,
  RefreshCw,
  Save,
  Settings,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useEffect, useState, startTransition } from "react";
import { generateImages, optimizePrompt, testImageModel, testTextModel } from "./core/apiClient";
import { DEFAULT_CONFIG, validateConfig, type AppConfig } from "./core/config";
import { groupHistoryByDate, type ImageRecord } from "./core/history";
import { getRuntimeAdapter } from "./runtime";
import type { RuntimeAdapter } from "./runtime/types";

type TaskState =
  | { status: "idle" }
  | { status: "running"; startedAt: number; message: string }
  | { status: "success"; message: string; previewUrl: string }
  | { status: "failed"; message: string };

export default function App() {
  const [runtime, setRuntime] = useState<RuntimeAdapter | null>(null);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [history, setHistory] = useState<ImageRecord[]>([]);
  const [prompt, setPrompt] = useState("");
  const [optimizedPrompt, setOptimizedPrompt] = useState("");
  const [customName, setCustomName] = useState("");
  const [activeTab, setActiveTab] = useState<"generate" | "history" | "settings">("generate");
  const [task, setTask] = useState<TaskState>({ status: "idle" });
  const [settingsMessage, setSettingsMessage] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    let mounted = true;
    getRuntimeAdapter().then(async (adapter) => {
      if (!mounted) return;
      const loadedConfig = await adapter.loadConfig();
      const loadedHistory = await adapter.loadHistory();
      setRuntime(adapter);
      setConfig(loadedConfig);
      setHistory(loadedHistory);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (task.status !== "running") return;
    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - task.startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [task]);

  const validation = validateConfig(config);
  const effectivePrompt = optimizedPrompt || prompt;
  const groups = groupHistoryByDate(history);

  async function handleSaveConfig() {
    if (!runtime) return;
    await runtime.saveConfig(config);
    setSettingsMessage(validation.errors.length ? "Saved with warnings." : "Settings saved.");
  }

  async function handleChooseDirectory() {
    if (!runtime) return;
    const selected = await runtime.chooseOutputDirectory();
    if (selected) {
      setConfig((current) => ({ ...current, outputDirectory: selected }));
    }
  }

  async function handleTestTextModel() {
    try {
      setSettingsMessage("Testing text model...");
      await testTextModel(config);
      setSettingsMessage("Text model test passed.");
    } catch (error) {
      setSettingsMessage(error instanceof Error ? `Text model test failed: ${error.message}` : "Text model test failed.");
    }
  }

  async function handleTestImageModel() {
    try {
      setSettingsMessage("Testing image model. This may create one real image request.");
      await testImageModel(config);
      setSettingsMessage("Image model test passed.");
    } catch (error) {
      setSettingsMessage(error instanceof Error ? `Image model test failed: ${error.message}` : "Image model test failed.");
    }
  }

  async function handleOptimizePrompt() {
    if (!prompt.trim()) return;
    try {
      setTask({ status: "running", startedAt: Date.now(), message: "Optimizing prompt" });
      const improved = await optimizePrompt(config, prompt);
      setOptimizedPrompt(improved);
      setTask({ status: "idle" });
    } catch (error) {
      setTask({
        status: "failed",
        message: error instanceof Error ? error.message : "Prompt optimization failed.",
      });
    }
  }

  async function handleGenerate() {
    if (!runtime || !effectivePrompt.trim()) return;
    const errors = validateConfig(config).errors;
    if (errors.length) {
      setTask({ status: "failed", message: errors.join(" ") });
      return;
    }

    const startedAt = Date.now();
    try {
      setElapsedSeconds(0);
      setTask({ status: "running", startedAt, message: "Generating image" });
      const images = await generateImages(config, effectivePrompt);
      const saved = await runtime.saveImage({
        image: images[0],
        prompt,
        optimizedPrompt,
        customName,
        config,
        generatedAt: new Date(),
        durationMs: Date.now() - startedAt,
      });
      const loadedHistory = await runtime.loadHistory();
      startTransition(() => setHistory(loadedHistory));
      setTask({ status: "success", message: "Image saved.", previewUrl: saved.previewUrl });
    } catch (error) {
      setTask({
        status: "failed",
        message: error instanceof Error ? error.message : "Image generation failed.",
      });
    }
  }

  return (
    <main className="app-shell">
      <div className="topbar">
        <div>
          <h1>Chat To Image</h1>
          <span className="mode-pill">{runtime?.mode ?? "loading"}</span>
        </div>
        <nav className="tabs">
          <button className={activeTab === "generate" ? "active" : ""} onClick={() => setActiveTab("generate")}>
            <ImageIcon size={16} /> Generate
          </button>
          <button className={activeTab === "history" ? "active" : ""} onClick={() => setActiveTab("history")}>
            <RefreshCw size={16} /> History
          </button>
          <button className={activeTab === "settings" ? "active" : ""} onClick={() => setActiveTab("settings")}>
            <Settings size={16} /> Settings
          </button>
        </nav>
      </div>

      <section className={`workspace ${activeTab !== "generate" ? "mobile-hidden" : ""}`}>
        <aside className="panel controls-panel">
          <label>
            Prompt
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={10} />
          </label>
          <label>
            Image name
            <input value={customName} onChange={(event) => setCustomName(event.target.value)} />
          </label>
          <button className="secondary" onClick={handleOptimizePrompt} disabled={!prompt.trim() || task.status === "running"}>
            <Wand2 size={16} /> Optimize Prompt
          </button>
          {optimizedPrompt && (
            <label>
              Optimized prompt
              <textarea value={optimizedPrompt} onChange={(event) => setOptimizedPrompt(event.target.value)} rows={6} />
            </label>
          )}
          <div className="parameter-grid">
            <label>
              Size
              <select value={config.defaultSize} onChange={(event) => setConfig({ ...config, defaultSize: event.target.value })}>
                <option>1024x1024</option>
                <option>1024x1536</option>
                <option>1536x1024</option>
              </select>
            </label>
            <label>
              Count
              <input
                type="number"
                min={1}
                max={4}
                value={config.defaultCount}
                onChange={(event) => setConfig({ ...config, defaultCount: Number(event.target.value) })}
              />
            </label>
          </div>
          <button className="primary" onClick={handleGenerate} disabled={!runtime || !effectivePrompt.trim() || task.status === "running"}>
            <Sparkles size={16} /> Generate
          </button>
        </aside>

        <section className="panel preview-panel">
          {task.status === "running" && (
            <div className="state-box">
              <Loader2 className="spin" size={28} />
              <h2>{task.message}</h2>
              <p>{elapsedSeconds}s elapsed. Long image requests are expected.</p>
            </div>
          )}
          {task.status === "idle" && (
            <div className="state-box muted">
              <ImageIcon size={40} />
              <h2>Result preview</h2>
              <p>Generated images appear here after saving.</p>
            </div>
          )}
          {task.status === "success" && (
            <div className="result-frame">
              <img src={task.previewUrl} alt="Generated result" />
              <p><CheckCircle2 size={16} /> {task.message}</p>
            </div>
          )}
          {task.status === "failed" && (
            <div className="state-box error">
              <AlertCircle size={32} />
              <h2>Request failed</h2>
              <p>{task.message}</p>
            </div>
          )}
        </section>

        <aside className="panel history-panel">
          <h2>History</h2>
          {groups.map((group) => (
            <section key={group.date} className="history-group">
              <h3>{group.date}</h3>
              {group.records.map((record) => (
                <button key={record.id} className="history-item" onClick={() => setPrompt(record.prompt)}>
                  <span>{record.prompt || "Untitled"}</span>
                  <small>{record.model}</small>
                </button>
              ))}
            </section>
          ))}
        </aside>
      </section>

      {activeTab === "settings" && (
        <section className="panel settings-panel">
          <div className="settings-grid">
            <label>Base URL<input value={config.baseUrl} onChange={(event) => setConfig({ ...config, baseUrl: event.target.value })} /></label>
            <label>API key<input type="password" value={config.apiKey} onChange={(event) => setConfig({ ...config, apiKey: event.target.value })} /></label>
            <label>Text model<input value={config.textModel} onChange={(event) => setConfig({ ...config, textModel: event.target.value })} /></label>
            <label>Image model<input value={config.imageModel} onChange={(event) => setConfig({ ...config, imageModel: event.target.value })} /></label>
            <label>Timeout seconds<input type="number" min={180} value={config.timeoutSeconds} onChange={(event) => setConfig({ ...config, timeoutSeconds: Number(event.target.value) })} /></label>
            <label>Output directory<input value={config.outputDirectory} onChange={(event) => setConfig({ ...config, outputDirectory: event.target.value })} /></label>
          </div>
          <div className="action-row">
            <button className="secondary" onClick={handleChooseDirectory}><FolderOpen size={16} /> Choose Directory</button>
            <button className="secondary" onClick={handleTestTextModel}>Test Text</button>
            <button className="secondary" onClick={handleTestImageModel}>Test Image</button>
            <button className="primary" onClick={handleSaveConfig}><Save size={16} /> Save</button>
          </div>
          {settingsMessage && <p className="settings-message">{settingsMessage}</p>}
          {validation.errors.concat(validation.warnings).map((message) => <p className="validation" key={message}>{message}</p>)}
        </section>
      )}

      {activeTab === "history" && (
        <section className="panel full-history">
          {groups.map((group) => (
            <section key={group.date}>
              <h2>{group.date}</h2>
              {group.records.map((record) => (
                <article key={record.id} className="record-row">
                  <div>
                    <strong>{record.prompt || "Untitled"}</strong>
                    <p>{record.outputPath}</p>
                  </div>
                  <button className="secondary" onClick={() => setPrompt(record.prompt)}>Reuse</button>
                </article>
              ))}
            </section>
          ))}
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Replace `src/styles.css` with the final responsive style**

Use a restrained tool palette with fixed control sizing:

```css
:root {
  color: #1d2329;
  background: #f3f0ea;
  font-family: "Aptos", "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
}

button,
input,
select,
textarea {
  font: inherit;
}

button {
  border: 0;
  cursor: pointer;
}

.app-shell {
  min-height: 100vh;
  padding: 24px;
  background:
    linear-gradient(135deg, rgba(226, 232, 220, 0.95), rgba(245, 241, 232, 0.95)),
    radial-gradient(circle at 20% 10%, rgba(81, 125, 111, 0.12), transparent 32%);
}

.topbar,
.workspace,
.settings-panel,
.full-history {
  max-width: 1440px;
  margin: 0 auto;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}

h1,
h2,
h3,
p {
  margin-top: 0;
}

h1 {
  margin-bottom: 6px;
  font-size: 28px;
}

.mode-pill {
  display: inline-flex;
  padding: 4px 9px;
  border-radius: 999px;
  background: #dbe6df;
  color: #315c50;
  font-size: 12px;
  text-transform: uppercase;
}

.tabs {
  display: flex;
  gap: 8px;
}

.tabs button,
.primary,
.secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  border-radius: 7px;
  padding: 0 14px;
}

.tabs button,
.secondary {
  background: rgba(255, 255, 255, 0.72);
  color: #27313a;
  border: 1px solid rgba(39, 49, 58, 0.14);
}

.tabs button.active,
.primary {
  background: #315c50;
  color: #fff;
}

.workspace {
  display: grid;
  grid-template-columns: minmax(290px, 360px) minmax(420px, 1fr) minmax(260px, 320px);
  gap: 16px;
}

.panel {
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(39, 49, 58, 0.12);
  border-radius: 8px;
  box-shadow: 0 16px 44px rgba(37, 43, 35, 0.08);
}

.controls-panel,
.history-panel,
.settings-panel,
.full-history {
  padding: 18px;
}

label {
  display: grid;
  gap: 7px;
  margin-bottom: 14px;
  color: #46515a;
  font-size: 13px;
}

input,
select,
textarea {
  width: 100%;
  border: 1px solid rgba(39, 49, 58, 0.18);
  border-radius: 7px;
  background: #fff;
  color: #1d2329;
  padding: 10px 11px;
}

textarea {
  resize: vertical;
  line-height: 1.5;
}

.parameter-grid,
.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.preview-panel {
  min-height: 620px;
  display: grid;
  place-items: center;
  overflow: hidden;
}

.state-box {
  display: grid;
  justify-items: center;
  gap: 10px;
  max-width: 420px;
  padding: 24px;
  text-align: center;
  color: #43505a;
}

.state-box.error {
  color: #9d2d2d;
}

.muted {
  color: #6f7a82;
}

.spin {
  animation: spin 1.2s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.result-frame {
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-rows: 1fr auto;
  gap: 12px;
  padding: 14px;
}

.result-frame img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 6px;
  background: #ece8dd;
}

.history-group {
  margin-bottom: 18px;
}

.history-item,
.record-row {
  width: 100%;
  display: grid;
  gap: 5px;
  margin-bottom: 8px;
  padding: 10px;
  border-radius: 7px;
  background: #f6f4ee;
  color: #1d2329;
  text-align: left;
}

.history-item small,
.record-row p {
  color: #6f7a82;
}

.settings-panel,
.full-history {
  margin-top: 16px;
}

.action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.settings-message,
.validation {
  margin-top: 12px;
  color: #6b572a;
}

.record-row {
  grid-template-columns: 1fr auto;
  align-items: center;
}

@media (max-width: 980px) {
  .topbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .workspace {
    grid-template-columns: 1fr;
  }

  .preview-panel {
    min-height: 420px;
  }

  .history-panel {
    display: none;
  }
}

@media (max-width: 620px) {
  .app-shell {
    padding: 14px;
  }

  .tabs {
    width: 100%;
    overflow-x: auto;
  }

  .parameter-grid,
  .settings-grid,
  .record-row {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 3: Run full frontend tests and build**

Run:

```powershell
npm run test:run
npm run build
```

Expected: tests pass and Vite build succeeds.

- [ ] **Step 4: Run web app locally**

Run:

```powershell
npm run dev
```

Expected: Vite serves at `http://localhost:5173`.

- [ ] **Step 5: Commit UI workflow**

Run:

```powershell
git add src/App.tsx src/styles.css
git commit -m "feat: build image generation workspace"
```

Expected: commit succeeds.

### Task 9: README And User Setup

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

`README.md`:

```md
# Chat To Image

Local image generation workspace with a web mode and a Tauri desktop mode.

## Defaults

- Base URL: `https://ruoli.dev/v1`
- Text model: `gpt-5.4-mini`
- Image model: `gpt-image-2`
- API key: empty by default
- Timeout: `180` seconds
- Output directory: `outputs/`

## Install

```powershell
npm install
```

## Web Mode

```powershell
npm run dev
```

Open `http://localhost:5173`.

Web mode stores configuration in browser storage. The API key is not written to project files. Image saving uses a browser-selected directory when supported and falls back to downloading files.

## Desktop Mode

```powershell
npm run desktop:dev
```

Desktop mode stores configuration in the user's app data directory and saves generated images into the configured output directory.

## Settings

Open Settings in the app and enter:

- API key
- Base URL
- Text model
- Image model
- Timeout
- Output directory

Text model tests and image model tests are optional. A failed test does not block saving configuration.

## Generated Files

By default, generated images are saved like this:

```text
outputs/
  2026-04-30/
    21-15-08_prompt-summary.png
```

If an image name is provided before generation, that name is used after sanitizing invalid filename characters.

## Build

```powershell
npm run build
npm run desktop:build
```

## Safety

Do not commit real API keys. The repository intentionally ships with an empty API key.
```

- [ ] **Step 2: Commit README**

Run:

```powershell
git add README.md
git commit -m "docs: add local setup guide"
```

Expected: commit succeeds.

### Task 10: Final Verification

**Files:**
- No new files.

- [ ] **Step 1: Run all automated verification**

Run:

```powershell
npm run test:run
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: all commands pass.

- [ ] **Step 2: Verify web mode manually**

Run:

```powershell
npm run dev
```

Expected:

- `http://localhost:5173` loads.
- Settings show `https://ruoli.dev/v1`, `gpt-5.4-mini`, `gpt-image-2`, and timeout `180`.
- API key is empty.
- Saving settings persists after refresh.
- Prompt optimization button is visible but not automatic.
- Generate button refuses to run without required config.

- [ ] **Step 3: Verify desktop mode manually**

Run:

```powershell
npm run desktop:dev
```

Expected:

- Desktop window opens.
- Settings save and reload.
- Output directory can be selected.
- History loads without crashing.
- Open output directory action works after a successful saved image.

## Self-Review Checklist

- Spec coverage: the plan covers shared web and desktop modes, local config, empty default API key, editable models, optional tests, optional prompt optimization, 180-second timeout, output directory selection, date folders, custom naming, history metadata, and clean tool UI.
- Red-flag scan: no incomplete or unspecified implementation steps should remain in this plan.
- Type consistency: `AppConfig`, `ImageRecord`, `ParsedImage`, `RuntimeAdapter`, and Tauri DTO names are defined before use and reused consistently.
- Test strategy: core logic is covered by Vitest; Rust persistence has a smoke test; final verification includes build, tests, web mode, and desktop mode.
