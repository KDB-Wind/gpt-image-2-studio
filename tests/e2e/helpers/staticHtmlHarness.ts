import { expect, type Page } from "@playwright/test";
import { Buffer } from "node:buffer";
import { deflateSync } from "node:zlib";

import { DEFAULT_CONFIG, type AppConfig } from "../../../src/core/config";

export const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function createPngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
}

export function createProviderSafePngBuffer(width = 64, height = 64): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;

  const row = Buffer.alloc(1 + width * 4);
  for (let offset = 1; offset < row.length; offset += 4) {
    row[offset] = 64;
    row[offset + 1] = 160;
    row[offset + 2] = 96;
    row[offset + 3] = 255;
  }

  const pixels = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    createPngChunk("IHDR", header),
    createPngChunk("IDAT", deflateSync(pixels)),
    createPngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const CONFIG_KEY = "chat-to-image.config.v1";
const HISTORY_KEY = "chat-to-image.history.v1";
const BATCH_DRAFT_KEY = "chat-to-image.batch.draft.v1";
const BATCH_MANIFEST_KEY = "chat-to-image.batch.manifests.v1";

export async function openCleanStaticPage(page: Page, config?: Partial<AppConfig>) {
  await page.goto("/");
  await page.evaluate(
    ({ configKey, historyKey, batchDraftKey, batchManifestKey, nextConfig }) => {
      localStorage.removeItem(historyKey);
      localStorage.removeItem(batchManifestKey);
      localStorage.setItem(configKey, JSON.stringify(nextConfig));
      localStorage.setItem(
        batchDraftKey,
        JSON.stringify({
          schemaVersion: 1,
          id: "batch-e2e-clean",
          title: "",
          source: "same-prompt",
          status: "draft",
          createdAt: new Date(0).toISOString(),
          startedAt: "",
          completedAt: "",
          masterPrompt: "",
          styleLock: "",
          customPromptDrafts: Array.from({ length: nextConfig.batchDefaultTaskCount }, () => ""),
          taskCount: nextConfig.batchDefaultTaskCount,
          splitTemplateId: "basic",
          customSplitSystemPrompt: "",
          tasks: [],
        }),
      );
    },
    {
      configKey: CONFIG_KEY,
      historyKey: HISTORY_KEY,
      batchDraftKey: BATCH_DRAFT_KEY,
      batchManifestKey: BATCH_MANIFEST_KEY,
      nextConfig: {
        ...DEFAULT_CONFIG,
        baseUrl: "https://example.test/v1",
        apiKey: "test-api-key",
        textModel: "test-text-model",
        imageModel: "test-image-model",
        uiLanguage: "zh-CN",
        hasDismissedWelcome: true,
        batchDefaultTaskCount: 2,
        batchDefaultConcurrency: 1,
        batchDefaultIntervalSeconds: 0,
        batchDefaultMaxRetries: 0,
        ...config,
      },
    },
  );
  await page.reload();
}

export async function mockImageGeneration(page: Page) {
  await page.route("**/images/generations", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [{ b64_json: ONE_PIXEL_PNG_BASE64 }],
      }),
    });
  });
}

type MockOutputDirectoryOptions = {
  failImageWrites?: boolean;
  writeError?: string;
};

export async function installMockOutputDirectory(page: Page, options: MockOutputDirectoryOptions = {}) {
  await page.addInitScript((mockOptions: MockOutputDirectoryOptions) => {
    const storageKey = "gpt-image-2-studio.e2e.mock-output-files.v1";
    const directories = new Map<string, unknown>();

    type StoredFile = {
      content: string;
      type: string;
    };

    function readFiles(): Record<string, StoredFile> {
      try {
        return JSON.parse(localStorage.getItem(storageKey) ?? "{}") as Record<string, StoredFile>;
      } catch {
        return {};
      }
    }

    function writeFiles(files: Record<string, StoredFile>) {
      localStorage.setItem(storageKey, JSON.stringify(files));
    }

    async function blobToBase64(blob: Blob): Promise<string> {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (const byte of bytes) {
        binary += String.fromCharCode(byte);
      }

      return btoa(binary);
    }

    function base64ToFile(fileName: string, storedFile: StoredFile): File {
      const binary = atob(storedFile.content);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      return new File([bytes], fileName, { type: storedFile.type });
    }

    function createDirectoryHandle(name: string, path = name): FileSystemDirectoryHandle {
      return {
        name,
        async queryPermission() {
          return "granted" as PermissionState;
        },
        async requestPermission() {
          return "granted" as PermissionState;
        },
        async getDirectoryHandle(childName: string, options?: { create?: boolean }) {
          const childPath = `${path}/${childName}`;
          const existing = directories.get(childPath);
          if (existing) {
            return existing as FileSystemDirectoryHandle;
          }

          const hasStoredChildFiles = Object.keys(readFiles()).some((filePath) => filePath.startsWith(`${childPath}/`));
          if (hasStoredChildFiles) {
            const childHandle = createDirectoryHandle(childName, childPath);
            directories.set(childPath, childHandle);
            return childHandle;
          }

          if (!options?.create) {
            throw new DOMException(`Directory not found: ${childName}`, "NotFoundError");
          }

          const childHandle = createDirectoryHandle(childName, childPath);
          directories.set(childPath, childHandle);
          return childHandle;
        },
        async getFileHandle(fileName: string, options?: { create?: boolean }) {
          const key = `${path}/${fileName}`;
          if (!readFiles()[key] && !options?.create) {
            throw new DOMException(`File not found: ${fileName}`, "NotFoundError");
          }

          return {
            async getFile() {
              const storedFile = readFiles()[key];
              if (!storedFile) {
                throw new DOMException(`File not found: ${fileName}`, "NotFoundError");
              }

              return base64ToFile(fileName, storedFile);
            },
            async createWritable() {
              if (mockOptions.failImageWrites && fileName !== "manifest.json") {
                throw new DOMException(mockOptions.writeError ?? "Mock output directory write permission denied.", "NotAllowedError");
              }

              return {
                async write(data: BufferSource | Blob | string) {
                  const blob = data instanceof Blob ? data : new Blob([data]);
                  writeFiles({
                    ...readFiles(),
                    [key]: {
                      content: await blobToBase64(blob),
                      type: blob.type,
                    },
                  });
                },
                async close() {
                  return undefined;
                },
              } as unknown as FileSystemWritableFileStream;
            },
          } as FileSystemFileHandle;
        },
      };
    }

    window.showDirectoryPicker = async () => createDirectoryHandle("gpt-image-2-studio");
  }, options);
}

export async function readMockOutputDirectoryFile(page: Page, fileName: string): Promise<string | null> {
  return page.evaluate(
    ({ storageKey, expectedFileName }) => {
      const files = JSON.parse(localStorage.getItem(storageKey) ?? "{}") as Record<string, { content: string }>;
      const entry = Object.entries(files).find(([path]) => path.endsWith(`/${expectedFileName}`));
      if (!entry) {
        return null;
      }

      return new TextDecoder().decode(Uint8Array.from(atob(entry[1].content), (char) => char.charCodeAt(0)));
    },
    { storageKey: "gpt-image-2-studio.e2e.mock-output-files.v1", expectedFileName: fileName },
  );
}

export async function expectHistoryContains(page: Page, text: string) {
  await page.getByRole("tab", { name: "历史" }).click();
  await expect(page.getByRole("article").filter({ hasText: text }).first()).toBeVisible();
}

export async function expectBatchHistoryContains(page: Page, batchTitle: string, childText: string) {
  await page.getByRole("tab", { name: "历史" }).click();
  const batchArticle = page.getByRole("article").filter({ hasText: batchTitle }).first();
  await expect(batchArticle).toBeVisible();
  const expandButton = batchArticle.getByRole("button", { name: "展开批次" });
  if (await expandButton.isVisible()) {
    await expandButton.click();
  }
  await expect(batchArticle.getByRole("article").filter({ hasText: childText }).first()).toBeVisible();
}
