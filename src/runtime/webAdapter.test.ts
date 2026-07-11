import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BatchTask } from "../core/batchTypes";
import { DEFAULT_CONFIG } from "../core/config";
import { __resetWebAdapterForTests, isSameOutputDirectoryHandle, webAdapter } from "./webAdapter";

const ONE_PIXEL_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lwP8NwAAAABJRU5ErkJggg==";
const SESSION_API_KEY = ["session", "provider", "key", "123456789"].join("-");
const REMEMBERED_API_KEY = ["remembered", "provider", "key", "123456789"].join("-");
const CURRENT_SESSION_API_KEY = ["current", "session", "key", "987654321"].join("-");
const STALE_API_KEY = ["stale", "persistent", "provider", "key", "123456789"].join("-");
const LEGACY_API_KEY = ["legacy", "provider", "key", "123456789"].join("-");
const MEMORY_API_KEY = ["memory", "provider", "key", "123456789"].join("-");

describe("webAdapter history deletion", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    __resetWebAdapterForTests();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("keeps the API key out of ordinary local config and restores it from session storage", async () => {
    await webAdapter.saveConfig({
      ...DEFAULT_CONFIG,
      apiKey: SESSION_API_KEY,
      rememberApiKey: false,
      uiLanguage: "en-US",
    });

    const storedConfig = JSON.parse(localStorage.getItem("chat-to-image.config.v1") ?? "{}");
    expect(storedConfig.apiKey).toBeUndefined();
    expect(localStorage.getItem("chat-to-image.api-key.persistent.v1")).toBeNull();
    await expect(webAdapter.loadConfig()).resolves.toMatchObject({
      apiKey: SESSION_API_KEY,
      rememberApiKey: false,
      uiLanguage: "en-US",
    });
  });

  it("persists the API key separately only after explicit opt-in", async () => {
    await webAdapter.saveConfig({
      ...DEFAULT_CONFIG,
      apiKey: REMEMBERED_API_KEY,
      rememberApiKey: true,
    });

    const storedConfig = JSON.parse(localStorage.getItem("chat-to-image.config.v1") ?? "{}");
    expect(storedConfig.apiKey).toBeUndefined();
    expect(localStorage.getItem("chat-to-image.api-key.persistent.v1")).toContain(REMEMBERED_API_KEY);

    sessionStorage.clear();
    await expect(webAdapter.loadConfig()).resolves.toMatchObject({
      apiKey: REMEMBERED_API_KEY,
      rememberApiKey: true,
    });
  });

  it("removes a remembered key when opt-in is disabled but keeps the current session key", async () => {
    await webAdapter.saveConfig({
      ...DEFAULT_CONFIG,
      apiKey: REMEMBERED_API_KEY,
      rememberApiKey: true,
    });
    await webAdapter.saveConfig({
      ...DEFAULT_CONFIG,
      apiKey: CURRENT_SESSION_API_KEY,
      rememberApiKey: false,
    });

    expect(localStorage.getItem("chat-to-image.api-key.persistent.v1")).toBeNull();
    await expect(webAdapter.loadConfig()).resolves.toMatchObject({
      apiKey: CURRENT_SESSION_API_KEY,
      rememberApiKey: false,
    });
  });

  it("removes a stale persistent key while loading an opted-out config", async () => {
    localStorage.setItem(
      "chat-to-image.config.v1",
      JSON.stringify({ ...DEFAULT_CONFIG, apiKey: undefined, rememberApiKey: false }),
    );
    localStorage.setItem(
      "chat-to-image.api-key.persistent.v1",
      JSON.stringify(STALE_API_KEY),
    );

    await expect(webAdapter.loadConfig()).resolves.toMatchObject({
      apiKey: "",
      rememberApiKey: false,
    });
    expect(localStorage.getItem("chat-to-image.api-key.persistent.v1")).toBeNull();
  });

  it("migrates a legacy API key out of the ordinary config into session storage", async () => {
    localStorage.setItem(
      "chat-to-image.config.v1",
      JSON.stringify({ ...DEFAULT_CONFIG, apiKey: LEGACY_API_KEY, rememberApiKey: false }),
    );

    await expect(webAdapter.loadConfig()).resolves.toMatchObject({
      apiKey: LEGACY_API_KEY,
      rememberApiKey: false,
    });
    const migratedConfig = JSON.parse(localStorage.getItem("chat-to-image.config.v1") ?? "{}");
    expect(migratedConfig.apiKey).toBeUndefined();
  });

  it("falls back safely when the stored config JSON is not an object", async () => {
    localStorage.setItem("chat-to-image.config.v1", "null");

    await expect(webAdapter.loadConfig()).resolves.toMatchObject(DEFAULT_CONFIG);
  });

  it("reports unsupported when the File System Access API is unavailable", async () => {
    vi.stubGlobal("showDirectoryPicker", undefined);

    await expect(getOutputDirectoryState()).resolves.toEqual({ status: "unsupported" });
  });

  it("treats synchronous indexedDB SecurityError failures as an unavailable persisted handle store", async () => {
    vi.stubGlobal("showDirectoryPicker", vi.fn());
    vi.stubGlobal("indexedDB", {
      open() {
        throw new DOMException("Access is denied for this document.", "SecurityError");
      },
    } as unknown as IDBFactory);

    await expect(getOutputDirectoryState()).resolves.toEqual({ status: "not-authorized" });
  });

  it("treats asynchronous indexedDB open failures as an unavailable persisted handle store", async () => {
    vi.stubGlobal("showDirectoryPicker", vi.fn());
    vi.stubGlobal("indexedDB", {
      open() {
        const request = {} as IDBOpenDBRequest;
        queueMicrotask(() => {
          request.onerror?.(new Event("error"));
        });
        return request;
      },
    } as unknown as IDBFactory);

    await expect(getOutputDirectoryState()).resolves.toEqual({ status: "not-authorized" });
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

  it("keeps working from in-memory stores when both browser storage APIs are blocked", async () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Access is denied for this document.", "SecurityError");
    });
    vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
      throw new DOMException("Access is denied for this document.", "SecurityError");
    });

    await webAdapter.saveConfig({
      ...DEFAULT_CONFIG,
      apiKey: MEMORY_API_KEY,
      rememberApiKey: false,
      uiLanguage: "en-US",
    });

    await expect(webAdapter.loadConfig()).resolves.toMatchObject({
      apiKey: MEMORY_API_KEY,
      rememberApiKey: false,
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

  it("saves base64 provider images without fetching a provider URL", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:base64-save");

    const result = await webAdapter.saveImage({
      image: { base64: ONE_PIXEL_PNG },
      prompt: "A base64 image.",
      optimizedPrompt: "",
      customName: "base64-image",
      config: { ...DEFAULT_CONFIG, defaultFormat: "png" },
      generatedAt: new Date("2026-07-06T10:30:00.000Z"),
      durationMs: 1000,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.previewUrl).toBe("blob:base64-save");
    await expect(webAdapter.loadHistory()).resolves.toEqual([
      expect.objectContaining({
        prompt: "A base64 image.",
        outputPath: expect.stringContaining("base64-image"),
      }),
    ]);
  });

  it("explains when a provider image URL cannot be downloaded without leaking the full URL", async () => {
    const providerUrl = "https://provider.example/generated.png?signature=private-token";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")));

    let message = "";
    try {
      await webAdapter.saveImage({
        image: { url: providerUrl },
        prompt: "A small test image.",
        optimizedPrompt: "",
        customName: "",
        config: DEFAULT_CONFIG,
        generatedAt: new Date("2026-07-05T10:00:00.000Z"),
        durationMs: 1200,
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("The provider returned an image URL, but this browser could not download it");
    expect(message).toContain("b64_json");
    expect(message).not.toContain(providerUrl);
  });

  it("redacts provider URLs that appear inside nested runtime error messages", async () => {
    const providerUrl = "https://provider.example/generated.png?signature=private-token";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValueOnce(new TypeError(`Failed to fetch ${providerUrl}`)),
    );

    let message = "";
    try {
      await webAdapter.saveImage({
        image: { url: providerUrl },
        prompt: "A small test image.",
        optimizedPrompt: "",
        customName: "",
        config: DEFAULT_CONFIG,
        generatedAt: new Date("2026-07-06T10:00:00.000Z"),
        durationMs: 1200,
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("The provider returned an image URL, but this browser could not download it");
    expect(message).toContain("b64_json");
    expect(message).not.toContain(providerUrl);
    expect(message).not.toContain("private-token");
    expect(message).not.toContain("provider.example/generated.png");
  });

  it("explains when a provider image URL returns an unsuccessful HTTP response", async () => {
    const providerUrl = "https://provider.example/forbidden.png";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 403,
      }),
    );

    await expect(
      webAdapter.saveImage({
        image: { url: providerUrl },
        prompt: "A small test image.",
        optimizedPrompt: "",
        customName: "",
        config: DEFAULT_CONFIG,
        generatedAt: new Date("2026-07-05T10:00:00.000Z"),
        durationMs: 1200,
      }),
    ).rejects.toThrow("Original error: HTTP 403");
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

  it("requires a successful output-directory test before reporting the directory as ready", async () => {
    const downloadsHandle = createDirectoryHandle({}, { name: "gpt-image-2-studio" });
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(downloadsHandle));

    await webAdapter.chooseOutputDirectory();
    await expect(getOutputDirectoryState()).resolves.toEqual({
      status: "permission-required",
      name: "gpt-image-2-studio",
    });

    await webAdapter.testOutputDirectory();

    await expect(getOutputDirectoryState()).resolves.toMatchObject({
      status: "ready",
      name: "gpt-image-2-studio",
      lastTestedAt: expect.any(String),
    });
  });

  it("does not treat same-name handles as the same tested directory", async () => {
    const firstHandle = createDirectoryHandle({}, { name: "Downloads" });
    const secondHandle = createDirectoryHandle({}, { name: "Downloads" });

    await expect(isSameOutputDirectoryHandle(firstHandle, secondHandle)).resolves.toBe(false);
  });

  it("uses isSameEntry when the browser exposes it", async () => {
    const firstHandle = createDirectoryHandle({}, { name: "Downloads" });
    const secondHandle = createDirectoryHandle({}, { name: "Downloads" });
    const sameEntryHandle = {
      ...firstHandle,
      isSameEntry: vi.fn().mockResolvedValue(true),
    } as FileSystemDirectoryHandle;

    await expect(isSameOutputDirectoryHandle(sameEntryHandle, secondHandle)).resolves.toBe(true);
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

  it("redacts batch save fallback reasons while preserving browser-download facts", async () => {
    const providerUrl = "https://provider.example/image.png?token=private-token";
    const downloadsHandle = createDirectoryHandle({}, {
      name: "gpt-image-2-studio",
      writable: false,
      writeError: `Cannot write ${providerUrl}`,
    });
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(downloadsHandle));
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:batch-fallback");

    await webAdapter.chooseOutputDirectory();

    const result = await webAdapter.saveBatchImage({
      batchId: "batch-20260524",
      batchTitle: "World Cup posters",
      batchCreatedAt: "2026-05-24T00:00:00.000Z",
      task: createBatchTask({ status: "running" }),
      image: { base64: ONE_PIXEL_PNG },
      config: { ...DEFAULT_CONFIG, defaultFormat: "png" },
      generatedAt: new Date("2026-05-24T00:03:00.000Z"),
      durationMs: 1500,
    });

    expect(result).toMatchObject({
      saveMode: "browser-download",
      saveFallbackReason: expect.stringContaining("[redacted-url]"),
    });
    expect(result.saveFallbackReason).not.toContain(providerUrl);
    expect(result.saveFallbackReason).not.toContain("private-token");
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

async function getOutputDirectoryState() {
  const query = Reflect.get(webAdapter, "getOutputDirectoryState");
  if (typeof query !== "function") {
    throw new Error("Runtime adapter does not expose output directory state.");
  }

  return query.call(webAdapter);
}

function createDirectoryHandle(
  entries: Record<string, File>,
  handleOptions: { name?: string; permission?: PermissionState; writable?: boolean; writeError?: string } = {},
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
        const nextHandle = createDirectoryHandle({}, {
          name,
          writable: handleOptions.writable,
          writeError: handleOptions.writeError,
        });
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
            throw new DOMException(handleOptions.writeError ?? `Cannot write file: ${name}`, "NotAllowedError");
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
