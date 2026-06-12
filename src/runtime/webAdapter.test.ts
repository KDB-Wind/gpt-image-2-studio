import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BatchTask } from "../core/batchTypes";
import { DEFAULT_CONFIG } from "../core/config";
import { webAdapter } from "./webAdapter";

const ONE_PIXEL_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lwP8NwAAAABJRU5ErkJggg==";

describe("webAdapter history deletion", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to session memory when localStorage is blocked by the browser", async () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Access is denied for this document.", "SecurityError");
    });

    await expect(webAdapter.loadConfig()).resolves.toMatchObject(DEFAULT_CONFIG);

    await webAdapter.saveConfig({ ...DEFAULT_CONFIG, apiKey: "test-key", uiLanguage: "en-US" });

    await expect(webAdapter.loadConfig()).resolves.toMatchObject({
      apiKey: "test-key",
      uiLanguage: "en-US",
    });
  });

  it("deletes selected history records from local storage and returns the remaining records", async () => {
    const first = await webAdapter.saveImage({
      image: { base64: ONE_PIXEL_PNG },
      prompt: "first image",
      optimizedPrompt: "",
      customName: "first",
      config: { ...DEFAULT_CONFIG, defaultFormat: "png" },
      generatedAt: new Date("2026-05-05T00:00:00.000Z"),
      durationMs: 1000,
    });
    const second = await webAdapter.saveImage({
      image: { base64: ONE_PIXEL_PNG },
      prompt: "second image",
      optimizedPrompt: "",
      customName: "second",
      config: { ...DEFAULT_CONFIG, defaultFormat: "png" },
      generatedAt: new Date("2026-05-05T00:01:00.000Z"),
      durationMs: 1000,
    });

    const remaining = await webAdapter.deleteHistoryRecords([first.record.id]);

    expect(remaining.map((record) => record.id)).toEqual([second.record.id]);
    expect((await webAdapter.loadHistory()).map((record) => record.id)).toEqual([second.record.id]);
  });

  it("records the real browser download file name when no authorized output directory is available", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fallback-download");

    const result = await webAdapter.saveImage({
      image: { base64: ONE_PIXEL_PNG },
      prompt: "Illustrate an Argentina World Cup poster",
      optimizedPrompt: "",
      customName: "",
      config: { ...DEFAULT_CONFIG, defaultFormat: "png", outputDirectory: "gpt-image-2-studio" },
      generatedAt: new Date(2026, 4, 26, 1, 53, 7),
      durationMs: 1000,
    });

    expect(result.previewUrl).toBe("blob:fallback-download");
    expect(result.saveMode).toBe("browser-download");
    expect(result.saveFallbackReason).toBeUndefined();
    expect(result.record.outputPath).toMatch(/^01-53-07_illustrate-an-argentina-world-cup-poster\.png$/);
    expect(result.record.outputPath).not.toContain("/");
  });

  it("requests read-write access when choosing an output directory", async () => {
    const downloadsHandle = createDirectoryHandle({}, { name: "gpt-image-2-studio" });
    const picker = vi.fn().mockResolvedValue(downloadsHandle);
    vi.stubGlobal("showDirectoryPicker", picker);

    await expect(webAdapter.chooseOutputDirectory()).resolves.toBe("gpt-image-2-studio");

    expect(picker).toHaveBeenCalledWith({ mode: "readwrite" });
  });

  it("writes images into the authorized output directory when a directory handle is available", async () => {
    const downloadsHandle = createDirectoryHandle({}, { name: "gpt-image-2-studio" });
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(downloadsHandle));
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:authorized-save");

    await webAdapter.chooseOutputDirectory();

    const result = await webAdapter.saveImage({
      image: { base64: ONE_PIXEL_PNG },
      prompt: "Illustrate a Japan World Cup poster",
      optimizedPrompt: "",
      customName: "",
      config: { ...DEFAULT_CONFIG, defaultFormat: "png", outputDirectory: "gpt-image-2-studio" },
      generatedAt: new Date(2026, 4, 26, 2, 4, 5),
      durationMs: 1000,
    });
    const dateFolder = await downloadsHandle.getDirectoryHandle("2026-05-26");
    const savedFile = await dateFolder
      .getFileHandle("02-04-05_illustrate-a-japan-world-cup-poster.png")
      .then((handle) => handle.getFile());

    expect(savedFile.type).toBe("image/png");
    expect(result.saveMode).toBe("authorized-directory");
    expect(result.saveFallbackReason).toBeUndefined();
    expect(result.record.outputPath).toBe(
      "gpt-image-2-studio/2026-05-26/02-04-05_illustrate-a-japan-world-cup-poster.png",
    );
  });

  it("reports when an authorized directory save falls back to browser download", async () => {
    const downloadsHandle = createDirectoryHandle({}, { name: "gpt-image-2-studio", writable: false });
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(downloadsHandle));
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fallback-after-authorized-save-failure");

    await webAdapter.chooseOutputDirectory();

    const result = await webAdapter.saveImage({
      image: { base64: ONE_PIXEL_PNG },
      prompt: "Illustrate a France World Cup poster",
      optimizedPrompt: "",
      customName: "",
      config: { ...DEFAULT_CONFIG, defaultFormat: "png", outputDirectory: "gpt-image-2-studio" },
      generatedAt: new Date(2026, 4, 26, 2, 10, 5),
      durationMs: 1000,
    });

    expect(result.previewUrl).toBe("blob:fallback-after-authorized-save-failure");
    expect(result.saveMode).toBe("browser-download");
    expect(result.saveFallbackReason).toContain("Cannot write file");
    expect(result.record.outputPath).toMatch(/^02-10-05_illustrate-a-france-world-cup-poster\.png$/);
  });

  it("previews old download-mode history from an authorized downloads folder by file name", async () => {
    const imageFile = new File(["image"], "00-02-36_test.png", { type: "image/png" });
    const downloadsHandle = createDirectoryHandle({
      "00-02-36_test.png": imageFile,
    });
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(downloadsHandle));
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:old-history-preview");

    await webAdapter.chooseOutputDirectory();

    const previewUrl = await webAdapter.prepareHistoryPreview({
      id: "record-1",
      status: "success",
      createdAt: "2026-05-24T00:02:36.000Z",
      prompt: "test",
      optimizedPrompt: "",
      model: "gpt-image-2",
      size: "auto",
      outputPath: "outputs/2026-05-24/00-02-36_test.png",
      durationMs: 1000,
    });

    expect(previewUrl).toBe("blob:old-history-preview");
  });

  it("returns the restored history file after folder authorization", async () => {
    const imageFile = new File(["image"], "00-02-36_test.png", { type: "image/png" });
    const downloadsHandle = createDirectoryHandle({
      "00-02-36_test.png": imageFile,
    });
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(downloadsHandle));

    await webAdapter.chooseOutputDirectory();

    const restoredFile = await webAdapter.prepareHistoryFile({
      id: "record-1",
      status: "success",
      createdAt: "2026-05-24T00:02:36.000Z",
      prompt: "test",
      optimizedPrompt: "",
      model: "gpt-image-2",
      size: "auto",
      outputPath: "outputs/2026-05-24/00-02-36_test.png",
      durationMs: 1000,
    });

    expect(restoredFile).toBe(imageFile);
  });

  it("writes and reads a tiny image when testing the authorized output directory", async () => {
    const downloadsHandle = createDirectoryHandle({});
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(downloadsHandle));

    await webAdapter.chooseOutputDirectory();

    const result = await webAdapter.testOutputDirectory();
    const savedFile = await downloadsHandle.getFileHandle("gpt-image-2-studio-folder-test.png").then((handle) =>
      handle.getFile(),
    );

    expect(result).toMatchObject({
      ok: true,
      fileName: "gpt-image-2-studio-folder-test.png",
    });
    expect(result.bytes).toBeGreaterThan(0);
    expect(savedFile.type).toBe("image/png");
  });

  it("stores batch metadata when saving a batch image history record", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:batch-image");

    const task = createBatchTask({
      id: "task-2",
      index: 1,
      title: "Japan poster",
      prompt: "Create a Japan World Cup poster in Japanese.",
    });

    const result = await webAdapter.saveBatchImage({
      batchId: "batch-20260524",
      batchTitle: "World Cup posters",
      batchCreatedAt: "2026-05-24T00:00:00.000Z",
      task,
      image: { base64: ONE_PIXEL_PNG },
      config: { ...DEFAULT_CONFIG, defaultFormat: "png" },
      generatedAt: new Date("2026-05-24T00:03:00.000Z"),
      durationMs: 1500,
    });

    expect(result.record.batch).toEqual({
      id: "batch-20260524",
      title: "World Cup posters",
      createdAt: "2026-05-24T00:00:00.000Z",
      taskId: "task-2",
      taskIndex: 1,
      taskTitle: "Japan poster",
      totalTasks: undefined,
    });
    await expect(webAdapter.loadHistory()).resolves.toEqual([expect.objectContaining({ batch: result.record.batch })]);
  });

  it("returns null when an authorized folder does not contain the old history image", async () => {
    const downloadsHandle = createDirectoryHandle({});
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(downloadsHandle));

    await webAdapter.chooseOutputDirectory();

    await expect(
      webAdapter.prepareHistoryPreview({
        id: "record-1",
        status: "success",
        createdAt: "2026-05-24T00:02:36.000Z",
        prompt: "test",
        optimizedPrompt: "",
        model: "gpt-image-2",
        size: "auto",
        outputPath: "outputs/2026-05-24/missing.png",
        durationMs: 1000,
      }),
    ).resolves.toBeNull();
  });
});

function createBatchTask(overrides: Partial<BatchTask>): BatchTask {
  return {
    id: "task-1",
    index: 0,
    title: "Task 1",
    prompt: "Prompt 1",
    status: "pending",
    attemptCount: 0,
    errorMessage: "",
    failureCategory: null,
    outputPath: "",
    previewUrl: "",
    durationMs: 0,
    startedAt: "",
    completedAt: "",
    ...overrides,
  };
}

function createDirectoryHandle(
  entries: Record<string, File>,
  handleOptions: { name?: string; permission?: PermissionState; writable?: boolean } = {},
): FileSystemDirectoryHandle {
  const files = new Map<string, File>(Object.entries(entries));
  const directories = new Map<string, FileSystemDirectoryHandle>();

  return {
    name: handleOptions.name ?? "Downloads",
    async queryPermission() {
      return handleOptions.permission ?? "granted";
    },
    async requestPermission() {
      return handleOptions.permission ?? "granted";
    },
    async getDirectoryHandle(name: string, getOptions?: { create?: boolean }) {
      const existing = directories.get(name);
      if (existing) {
        return existing;
      }

      if (getOptions?.create) {
        const nextHandle = createDirectoryHandle({}, { name, writable: handleOptions.writable });
        directories.set(name, nextHandle);
        return nextHandle;
      }

      throw new DOMException(`Directory not found: ${name}`, "NotFoundError");
    },
    async getFileHandle(name: string, getOptions?: { create?: boolean }) {
      const file = entries[name];
      if (!file && !files.has(name) && !getOptions?.create) {
        throw new DOMException(`File not found: ${name}`, "NotFoundError");
      }

      return {
        async getFile() {
          const currentFile = files.get(name);
          if (!currentFile) {
            throw new DOMException(`File not found: ${name}`, "NotFoundError");
          }

          return currentFile;
        },
        async createWritable() {
          if (handleOptions.writable === false) {
            throw new DOMException(`Cannot write file: ${name}`, "NotAllowedError");
          }

          return {
            async write(data: BufferSource | Blob | string) {
              const blob = data instanceof Blob ? data : new Blob([data]);
              files.set(name, new File([blob], name, { type: blob.type }));
            },
            async close() {
              return undefined;
            },
          } as unknown as FileSystemWritableFileStream;
        },
      } as unknown as FileSystemFileHandle;
    },
  } as unknown as FileSystemDirectoryHandle;
}
