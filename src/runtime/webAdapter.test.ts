import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildBatchDirectoryName } from "../core/batchManifest";
import { MAX_BATCH_TASK_COUNT, type BatchManifest, type BatchTask } from "../core/batchTypes";
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

  it("reports storage capability from successful read and write probes", async () => {
    const adapter = webAdapter as typeof webAdapter & {
      getStorageCapabilities(): Promise<{ local: boolean; session: boolean }>;
    };

    await expect(adapter.getStorageCapabilities()).resolves.toEqual({ local: true, session: true });
  });

  it("reports memory-only storage and clears remember preference when browser storage is denied", async () => {
    const adapter = webAdapter as typeof webAdapter & {
      getStorageCapabilities(): Promise<{ local: boolean; session: boolean }>;
    };
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Access is denied for this document.", "SecurityError");
    });
    vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
      throw new DOMException("Access is denied for this document.", "SecurityError");
    });

    await expect(adapter.getStorageCapabilities()).resolves.toEqual({ local: false, session: false });
    await webAdapter.saveConfig({ ...DEFAULT_CONFIG, apiKey: MEMORY_API_KEY, rememberApiKey: true });
    await expect(webAdapter.loadConfig()).resolves.toMatchObject({
      apiKey: MEMORY_API_KEY,
      rememberApiKey: false,
    });
  });

  it("persists a sanitized versioned batch workspace and restores it", async () => {
    const adapter = webAdapter as typeof webAdapter & {
      loadBatchWorkspace(): Promise<unknown>;
      saveBatchWorkspace(workspace: unknown): Promise<void>;
    };
    const workspace = createBatchWorkspace({
      apiKey: "must-not-persist",
      referenceImages: [new File(["reference-bytes"], "reference.png", { type: "image/png" })],
      tasks: [
        createWorkspaceTask({
          status: "succeeded",
          previewUrl: "blob:generated-secret-preview",
          saveFallbackReason: "Failed at https://provider.example/image.png?token=private-token",
        }),
        createWorkspaceTask({ id: "task-2", index: 1, prompt: "Launch beta" }),
      ],
    });

    await adapter.saveBatchWorkspace(workspace);

    const raw = localStorage.getItem("chat-to-image.batch.draft.v1") ?? "";
    expect(raw).toContain('"schemaVersion":1');
    expect(raw).not.toContain("blob:generated-secret-preview");
    expect(raw).not.toContain("private-token");
    expect(raw).not.toContain("apiKey");
    expect(raw).not.toContain("must-not-persist");
    expect(raw).not.toContain("reference-bytes");
    await expect(adapter.loadBatchWorkspace()).resolves.toMatchObject({
      schemaVersion: 1,
      masterPrompt: "Create two launch posters",
      taskCount: 2,
      tasks: [
        expect.objectContaining({ status: "succeeded", previewUrl: "" }),
        expect.objectContaining({ id: "task-2", index: 1 }),
      ],
    });
  });

  it("normalizes stale running workspace state to recoverable paused and pending state", async () => {
    const adapter = webAdapter as typeof webAdapter & {
      loadBatchWorkspace(): Promise<unknown>;
    };
    localStorage.setItem(
      "chat-to-image.batch.draft.v1",
      JSON.stringify(
        createBatchWorkspace({
          status: "running",
          tasks: [createWorkspaceTask({ status: "running", previewUrl: "blob:running" })],
        }),
      ),
    );

    await expect(adapter.loadBatchWorkspace()).resolves.toMatchObject({
      status: "paused",
      tasks: [
        expect.objectContaining({
          status: "pending",
          errorMessage: "",
          failureCategory: null,
          previewUrl: "",
        }),
      ],
    });
  });

  it("ignores absent, older, and malformed batch workspace values", async () => {
    const adapter = webAdapter as typeof webAdapter & {
      loadBatchWorkspace(): Promise<unknown>;
    };

    await expect(adapter.loadBatchWorkspace()).resolves.toBeNull();
    localStorage.setItem("chat-to-image.batch.draft.v1", JSON.stringify({ schemaVersion: 0, tasks: [] }));
    await expect(adapter.loadBatchWorkspace()).resolves.toBeNull();
    localStorage.setItem("chat-to-image.batch.draft.v1", "not-json");
    await expect(adapter.loadBatchWorkspace()).resolves.toBeNull();
  });

  it("uses the existing in-memory fallback for batch workspace when localStorage is denied", async () => {
    const adapter = webAdapter as typeof webAdapter & {
      loadBatchWorkspace(): Promise<unknown>;
      saveBatchWorkspace(workspace: unknown): Promise<void>;
    };
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Access is denied for this document.", "SecurityError");
    });

    await adapter.saveBatchWorkspace(createBatchWorkspace());

    await expect(adapter.loadBatchWorkspace()).resolves.toMatchObject({
      masterPrompt: "Create two launch posters",
      taskCount: 2,
    });
  });

  it("bounds malformed current-version batch workspaces and keeps count, prompts, and tasks consistent", async () => {
    const adapter = webAdapter as typeof webAdapter & {
      loadBatchWorkspace(): Promise<unknown>;
    };
    const oversizedTasks = Array.from({ length: MAX_BATCH_TASK_COUNT * 5 }, (_, index) =>
      createWorkspaceTask({
        id: `task-${index}`,
        index: MAX_BATCH_TASK_COUNT * 10 - index,
        prompt: `Prompt ${index}`,
        status: index === 0 ? ("tampered" as BatchTask["status"]) : "pending",
      }),
    );
    localStorage.setItem(
      "chat-to-image.batch.draft.v1",
      JSON.stringify(
        createBatchWorkspace({
          taskCount: 1,
          customPromptDrafts: [
            ...Array.from({ length: MAX_BATCH_TASK_COUNT * 5 }, (_, index) => `Draft ${index}`),
            { invalid: true },
          ],
          tasks: [
            { status: "succeeded", prompt: "missing id" },
            null,
            ...oversizedTasks,
          ],
        }),
      ),
    );

    const restored = await adapter.loadBatchWorkspace() as {
      taskCount: number;
      customPromptDrafts: string[];
      tasks: BatchTask[];
    };
    expect(restored.taskCount).toBe(MAX_BATCH_TASK_COUNT);
    expect(restored.customPromptDrafts).toHaveLength(MAX_BATCH_TASK_COUNT);
    expect(restored.tasks).toHaveLength(MAX_BATCH_TASK_COUNT);
    expect(restored.tasks.map((task) => task.index)).toEqual(
      Array.from({ length: MAX_BATCH_TASK_COUNT }, (_, index) => index),
    );
    expect(restored.tasks[0]).toMatchObject({ id: "task-0", status: "pending" });

    localStorage.setItem(
      "chat-to-image.batch.draft.v1",
      JSON.stringify(
        createBatchWorkspace({
          taskCount: MAX_BATCH_TASK_COUNT,
          customPromptDrafts: Array.from({ length: MAX_BATCH_TASK_COUNT }, (_, index) => `Draft ${index}`),
          tasks: [
            createWorkspaceTask({ id: "short-1", index: 8 }),
            createWorkspaceTask({ id: "short-2", index: 9 }),
          ],
        }),
      ),
    );
    const shortRestored = await adapter.loadBatchWorkspace() as {
      taskCount: number;
      customPromptDrafts: string[];
      tasks: BatchTask[];
    };
    expect(shortRestored.taskCount).toBe(2);
    expect(shortRestored.customPromptDrafts).toHaveLength(2);
    expect(shortRestored.tasks.map((task) => task.index)).toEqual([0, 1]);
  });

  it("repairs duplicate task IDs deterministically without collapsing task-keyed state", async () => {
    const adapter = webAdapter as typeof webAdapter & {
      loadBatchWorkspace(): Promise<unknown>;
    };
    localStorage.setItem(
      "chat-to-image.batch.draft.v1",
      JSON.stringify(
        createBatchWorkspace({
          taskCount: 4,
          customPromptDrafts: ["Draft A", "Draft B", "Draft C", "Draft D"],
          tasks: [
            createWorkspaceTask({ id: "shared-task", index: 0, prompt: "Prompt A" }),
            createWorkspaceTask({ id: "shared-task", index: 1, prompt: "Prompt B" }),
            createWorkspaceTask({ id: "shared-task-2", index: 2, prompt: "Prompt C" }),
            createWorkspaceTask({ id: "shared-task", index: 3, prompt: "Prompt D" }),
          ],
        }),
      ),
    );

    const firstRestore = await adapter.loadBatchWorkspace() as {
      taskCount: number;
      tasks: BatchTask[];
    };
    const secondRestore = await adapter.loadBatchWorkspace() as {
      taskCount: number;
      tasks: BatchTask[];
    };
    const taskIds = firstRestore.tasks.map((task) => task.id);
    const taskReferencesById = Object.fromEntries(
      firstRestore.tasks.map((task) => [task.id, task.prompt]),
    );

    expect(firstRestore.taskCount).toBe(4);
    expect(firstRestore.tasks.map((task) => task.prompt)).toEqual([
      "Prompt A",
      "Prompt B",
      "Prompt C",
      "Prompt D",
    ]);
    expect(new Set(taskIds).size).toBe(4);
    expect(secondRestore.tasks.map((task) => task.id)).toEqual(taskIds);
    expect(Object.values(taskReferencesById)).toEqual([
      "Prompt A",
      "Prompt B",
      "Prompt C",
      "Prompt D",
    ]);
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

  it("keeps existing authorized-folder bytes when browser history is empty", async () => {
    const downloadsHandle = createDirectoryHandle({}, { name: "gpt-image-2-studio" });
    const dateFolder = await downloadsHandle.getDirectoryHandle("2026-05-26", { create: true });
    await writeHandleFile(dateFolder, "poster.png", "existing-one", "image/png");
    await writeHandleFile(dateFolder, "poster-2.png", "existing-two", "image/png");
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(downloadsHandle));
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:authorized-save");

    await webAdapter.chooseOutputDirectory();
    const result = await webAdapter.saveImage({
      image: { base64: ONE_PIXEL_PNG },
      prompt: "Poster",
      optimizedPrompt: "",
      customName: "poster",
      config: { ...DEFAULT_CONFIG, defaultFormat: "png" },
      generatedAt: new Date(2026, 4, 26, 2, 4, 5),
      durationMs: 1000,
    });

    expect(result.record.outputPath).toBe("gpt-image-2-studio/2026-05-26/poster-3.png");
    await expect(readHandleFileText(dateFolder, "poster.png")).resolves.toBe("existing-one");
    await expect(readHandleFileText(dateFolder, "poster-2.png")).resolves.toBe("existing-two");
  });

  it("serializes concurrent authorized saves before allocating and writing file names", async () => {
    const downloadsHandle = createDirectoryHandle({}, {
      name: "gpt-image-2-studio",
      writeDelayMs: 20,
    });
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(downloadsHandle));
    vi.spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:parallel-first")
      .mockReturnValueOnce("blob:parallel-second");

    await webAdapter.chooseOutputDirectory();
    const saveInput = {
      image: { base64: ONE_PIXEL_PNG },
      prompt: "Parallel poster",
      optimizedPrompt: "",
      customName: "parallel-poster",
      config: { ...DEFAULT_CONFIG, defaultFormat: "png" as const },
      generatedAt: new Date(2026, 4, 26, 2, 4, 5),
      durationMs: 1000,
    };

    const results = await Promise.all([
      webAdapter.saveImage(saveInput),
      webAdapter.saveImage(saveInput),
    ]);

    expect(results.map((result) => result.record.outputPath).sort()).toEqual([
      "gpt-image-2-studio/2026-05-26/parallel-poster-2.png",
      "gpt-image-2-studio/2026-05-26/parallel-poster.png",
    ]);
    await expect(webAdapter.loadHistory()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ outputPath: "gpt-image-2-studio/2026-05-26/parallel-poster.png" }),
      expect.objectContaining({ outputPath: "gpt-image-2-studio/2026-05-26/parallel-poster-2.png" }),
    ]));
    await expect(webAdapter.loadHistory()).resolves.toHaveLength(2);
  });

  it("keeps concurrent batch filenames and both final history paths", async () => {
    const downloadsHandle = createDirectoryHandle({}, {
      name: "gpt-image-2-studio",
      writeDelayMs: 20,
    });
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(downloadsHandle));
    vi.spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:batch-parallel-first")
      .mockReturnValueOnce("blob:batch-parallel-second");

    await webAdapter.chooseOutputDirectory();
    const batchCreatedAt = "2026-05-24T00:00:00.000Z";
    const batchTitle = "Parallel batch";
    const saveInput = {
      batchId: "batch-parallel",
      batchTitle,
      batchCreatedAt,
      task: createBatchTask({ id: "task-parallel", title: "Task 1" }),
      image: { base64: ONE_PIXEL_PNG },
      config: { ...DEFAULT_CONFIG, defaultFormat: "png" as const },
      generatedAt: new Date("2026-05-24T00:03:00.000Z"),
      durationMs: 1500,
    };

    const results = await Promise.all([
      webAdapter.saveBatchImage(saveInput),
      webAdapter.saveBatchImage(saveInput),
    ]);
    const batchFolder = buildBatchDirectoryName(batchCreatedAt, batchTitle);
    const expectedPaths = [
      `gpt-image-2-studio/${batchFolder}/001-task-1-2.png`,
      `gpt-image-2-studio/${batchFolder}/001-task-1.png`,
    ];

    expect(results.map((result) => result.outputPath).sort()).toEqual(expectedPaths);
    expect(results.map((result) => result.record.outputPath).sort()).toEqual(expectedPaths);
    await expect(webAdapter.loadHistory()).resolves.toEqual(expect.arrayContaining(
      expectedPaths.map((outputPath) => expect.objectContaining({ outputPath })),
    ));
    await expect(webAdapter.loadHistory()).resolves.toHaveLength(2);

    const manifest = createTestBatchManifest();
    manifest.id = saveInput.batchId;
    manifest.title = batchTitle;
    manifest.createdAt = batchCreatedAt;
    manifest.tasks = results.map((result, index) => ({
      ...createBatchTask({ id: `task-${index + 1}`, index, status: "succeeded" }),
      outputPath: result.outputPath,
      saveMode: result.saveMode,
    }));
    await webAdapter.saveBatchManifest(manifest);
    const batchHandle = await downloadsHandle.getDirectoryHandle(batchFolder);
    const savedManifest = JSON.parse(await readHandleFileText(batchHandle, "manifest.json"));
    expect(savedManifest.tasks.map((task: { outputPath: string }) => task.outputPath).sort()).toEqual(expectedPaths);
  });

  it("releases the save transaction queue after a failed save", async () => {
    const downloadsHandle = createDirectoryHandle({}, { name: "gpt-image-2-studio" });
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(downloadsHandle));
    vi.spyOn(URL, "createObjectURL")
      .mockImplementationOnce(() => {
        throw new Error("Preview allocation failed.");
      })
      .mockImplementationOnce(() => {
        throw new Error("Fallback allocation failed.");
      })
      .mockReturnValueOnce("blob:queue-recovered");

    await webAdapter.chooseOutputDirectory();
    const saveInput = {
      image: { base64: ONE_PIXEL_PNG },
      prompt: "Queue recovery poster",
      optimizedPrompt: "",
      customName: "queue-recovery",
      config: { ...DEFAULT_CONFIG, defaultFormat: "png" as const },
      generatedAt: new Date(2026, 4, 26, 2, 4, 5),
      durationMs: 1000,
    };

    const firstSave = webAdapter.saveImage(saveInput);
    await Promise.resolve();
    const secondSave = webAdapter.saveImage(saveInput);
    const [firstResult, secondResult] = await Promise.allSettled([firstSave, secondSave]);

    expect(firstResult.status).toBe("rejected");
    expect(secondResult).toMatchObject({
      status: "fulfilled",
      value: {
        previewUrl: "blob:queue-recovered",
        record: { outputPath: "gpt-image-2-studio/2026-05-26/queue-recovery-2.png" },
      },
    });
    await expect(webAdapter.loadHistory()).resolves.toEqual([
      expect.objectContaining({ outputPath: "gpt-image-2-studio/2026-05-26/queue-recovery-2.png" }),
    ]);
  });

  it("keeps existing batch image bytes when browser history is unavailable", async () => {
    const downloadsHandle = createDirectoryHandle({}, { name: "gpt-image-2-studio" });
    const batchCreatedAt = "2026-05-24T00:00:00.000Z";
    const batchTitle = "World Cup posters";
    const batchFolderName = buildBatchDirectoryName(batchCreatedAt, batchTitle);
    const batchFolder = await downloadsHandle.getDirectoryHandle(batchFolderName, { create: true });
    await writeHandleFile(batchFolder, "001-task-1.png", "existing-batch", "image/png");
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(downloadsHandle));
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:batch-save");

    await webAdapter.chooseOutputDirectory();
    const result = await webAdapter.saveBatchImage({
      batchId: "batch-20260524",
      batchTitle,
      batchCreatedAt,
      task: createBatchTask({ title: "Task 1" }),
      image: { base64: ONE_PIXEL_PNG },
      config: { ...DEFAULT_CONFIG, defaultFormat: "png" },
      generatedAt: new Date("2026-05-24T00:03:00.000Z"),
      durationMs: 1500,
    });

    expect(result.outputPath).toBe(`gpt-image-2-studio/${batchFolderName}/001-task-1-2.png`);
    await expect(readHandleFileText(batchFolder, "001-task-1.png")).resolves.toBe("existing-batch");
  });

  it("falls back safely when an authorized-folder collision probe is denied", async () => {
    const providerUrl = "https://provider.example/private.png?token=private-token";
    const downloadsHandle = createDirectoryHandle({}, {
      name: "gpt-image-2-studio",
      probeError: `Cannot inspect ${providerUrl}`,
    });
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(downloadsHandle));
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:probe-fallback");

    await webAdapter.chooseOutputDirectory();
    const result = await webAdapter.saveImage({
      image: { base64: ONE_PIXEL_PNG },
      prompt: "Poster",
      optimizedPrompt: "",
      customName: "poster",
      config: { ...DEFAULT_CONFIG, defaultFormat: "png" },
      generatedAt: new Date(2026, 4, 26, 2, 4, 5),
      durationMs: 1000,
    });

    expect(result.saveMode).toBe("browser-download");
    expect(result.saveFallbackReason).toContain("[redacted-url]");
    expect(result.saveFallbackReason).not.toContain("private-token");
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
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:folder-test");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

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
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:folder-test");
  });

  it("writes an authorized batch manifest without allocating a Blob preview URL", async () => {
    const downloadsHandle = createDirectoryHandle({}, { name: "gpt-image-2-studio" });
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(downloadsHandle));
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:manifest-write");

    await webAdapter.chooseOutputDirectory();
    await expect(webAdapter.saveBatchManifest(createTestBatchManifest())).resolves.toContain("manifest.json");

    expect(createObjectUrl).not.toHaveBeenCalled();
  });

  it("revokes the temporary Blob URL after a browser-download batch manifest save", async () => {
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:manifest-download");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    await expect(webAdapter.saveBatchManifest(createTestBatchManifest())).resolves.toBe("manifest.json");

    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:manifest-download");
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

function createBatchWorkspace(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    id: "batch-workspace-1",
    title: "Launch campaign",
    source: "same-prompt",
    status: "completed",
    createdAt: "2026-07-12T00:00:00.000Z",
    startedAt: "2026-07-12T00:00:01.000Z",
    completedAt: "2026-07-12T00:00:02.000Z",
    masterPrompt: "Create two launch posters",
    styleLock: "Use one visual system",
    customPromptDrafts: ["Launch alpha", "Launch beta"],
    taskCount: 2,
    splitTemplateId: "basic",
    customSplitSystemPrompt: "",
    tasks: [
      createWorkspaceTask(),
      createWorkspaceTask({ id: "task-2", index: 1, title: "Launch beta", prompt: "Launch beta" }),
    ],
    ...overrides,
  };
}

function createTestBatchManifest(): BatchManifest {
  return {
    id: "batch-manifest",
    title: "Manifest batch",
    source: "same-prompt",
    createdAt: "2026-05-24T00:00:00.000Z",
    startedAt: "2026-05-24T00:00:01.000Z",
    completedAt: "2026-05-24T00:00:02.000Z",
    executionConfig: {
      concurrency: 1,
      intervalSeconds: 0,
      maxRetries: 0,
    },
    imageConfig: {
      model: "gpt-image-2",
      size: "auto",
      quality: "auto",
      format: "png",
      outputCompression: 100,
    },
    summary: {
      total: 1,
      pending: 0,
      running: 0,
      succeeded: 1,
      failed: 0,
      skipped: 0,
      durationMs: 1000,
    },
    tasks: [{
      ...createBatchTask({ status: "succeeded" }),
      outputPath: "gpt-image-2-studio/batch/001-task-1.png",
      saveMode: "authorized-directory",
    }],
  };
}

function createWorkspaceTask(overrides: Partial<BatchTask> = {}): BatchTask {
  return {
    id: "task-1",
    index: 0,
    title: "Launch alpha",
    prompt: "Launch alpha",
    status: "succeeded",
    attemptCount: 1,
    errorMessage: "",
    failureCategory: null,
    outputPath: "outputs/launch-alpha.png",
    previewUrl: "blob:launch-alpha",
    durationMs: 1000,
    startedAt: "2026-07-12T00:00:01.000Z",
    completedAt: "2026-07-12T00:00:02.000Z",
    ...overrides,
  };
}

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
  handleOptions: {
    name?: string;
    permission?: PermissionState;
    writable?: boolean;
    writeError?: string;
    probeError?: string;
    writeDelayMs?: number;
  } = {},
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
          probeError: handleOptions.probeError,
          writeDelayMs: handleOptions.writeDelayMs,
        });
        directories.set(name, nextHandle);
        return nextHandle;
      }

      throw new DOMException(`Directory not found: ${name}`, "NotFoundError");
    },
    async getFileHandle(name: string, getOptions?: { create?: boolean }) {
      if (!getOptions?.create && handleOptions.probeError) {
        throw new DOMException(handleOptions.probeError, "NotAllowedError");
      }
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
              if (handleOptions.writeDelayMs) {
                await new Promise((resolve) => setTimeout(resolve, handleOptions.writeDelayMs));
              }
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

async function writeHandleFile(
  directory: FileSystemDirectoryHandle,
  name: string,
  contents: string,
  type: string,
) {
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(new Blob([contents], { type }));
  await writable.close();
}

async function readHandleFileText(directory: FileSystemDirectoryHandle, name: string): Promise<string> {
  return directory.getFileHandle(name).then((handle) => handle.getFile()).then((file) => file.text());
}
