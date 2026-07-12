import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import staticVersionManifest from "../static-versions/manifest.json";
import * as apiClient from "./core/apiClient";
import { DEFAULT_CONFIG, mergeConfig } from "./core/config";
import type { ImageRecord } from "./core/history";
import { getTranslations } from "./i18n/translations";
import * as runtimeModule from "./runtime";
import type { RuntimeAdapter, SaveImageResult } from "./runtime/types";

const REMEMBERED_UI_API_KEY = ["remembered", "ui", "provider", "key", "123456789"].join("-");

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("App batch workspace", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem(
      "chat-to-image.config.v1",
      JSON.stringify({ ...DEFAULT_CONFIG, uiLanguage: "en-US", hasDismissedWelcome: true }),
    );
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("keeps legacy Single generation to one outbound and one persisted image", async () => {
    const copy = getTranslations("en-US");
    const runtime = createPreviewRuntime([createSaveImageResult("blob:single-one-image")]);
    runtime.loadConfig = vi.fn().mockResolvedValue({
      ...DEFAULT_CONFIG,
      apiKey: "test-key",
      defaultCount: 4,
      uiLanguage: "en-US",
      hasDismissedWelcome: true,
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [
        { b64_json: "first-image" },
        { b64_json: "unexpected-extra-image" },
      ],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.spyOn(runtimeModule, "getRuntimeAdapter").mockResolvedValue(runtime);
    vi.stubGlobal("fetch", fetchMock);

    await renderApp();
    setFieldValue(getField<HTMLTextAreaElement>(copy.fields.prompt, "textarea"), "Create one poster.");
    await clickButtonAsync(copy.actions.generate);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({ n: 1 });
    expect(runtime.saveImage).toHaveBeenCalledTimes(1);
    expect(runtime.saveImage).toHaveBeenCalledWith(expect.objectContaining({
      image: { base64: "first-image" },
      config: expect.objectContaining({ defaultCount: 1 }),
    }));
    expect(container.querySelectorAll('.preview-success img[src="blob:single-one-image"]')).toHaveLength(1);
  });

  it("releases the old generated preview when a new single-image preview replaces it", async () => {
    const copy = getTranslations("en-US");
    const runtime = createPreviewRuntime([
      createSaveImageResult("blob:single-first"),
      createSaveImageResult("blob:single-second"),
    ]);
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(runtimeModule, "getRuntimeAdapter").mockResolvedValue(runtime);
    vi.spyOn(apiClient, "generateImages").mockResolvedValue([{ base64: "first-image" }]);

    await renderApp();
    setFieldValue(getField<HTMLTextAreaElement>(copy.fields.prompt, "textarea"), "Create a first poster.");
    await clickButtonAsync(copy.actions.generate);
    setFieldValue(getField<HTMLTextAreaElement>(copy.fields.prompt, "textarea"), "Create a second poster.");
    await clickButtonAsync(copy.actions.generate);

    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:single-first");
  });

  it("releases a generated preview when its image element reports an error", async () => {
    const copy = getTranslations("en-US");
    const runtime = createPreviewRuntime([createSaveImageResult("blob:single-failed")]);
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(runtimeModule, "getRuntimeAdapter").mockResolvedValue(runtime);
    vi.spyOn(apiClient, "generateImages").mockResolvedValue([{ base64: "image" }]);

    await renderApp();
    setFieldValue(getField<HTMLTextAreaElement>(copy.fields.prompt, "textarea"), "Create a poster.");
    await clickButtonAsync(copy.actions.generate);

    const previewImage = container.querySelector<HTMLImageElement>(".preview-success img");
    if (!previewImage) {
      throw new Error("Generated preview image not found.");
    }
    act(() => {
      previewImage.dispatchEvent(new Event("error"));
    });

    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:single-failed");
  });

  it("releases a saved preview when refreshing history fails", async () => {
    const copy = getTranslations("en-US");
    const runtime = createPreviewRuntime([createSaveImageResult("blob:single-history-failure")]);
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(runtimeModule, "getRuntimeAdapter").mockResolvedValue(runtime);
    vi.spyOn(apiClient, "generateImages").mockResolvedValue([{ base64: "image" }]);

    await renderApp();
    vi.mocked(runtime.loadHistory).mockRejectedValueOnce(new Error("History refresh failed."));
    setFieldValue(getField<HTMLTextAreaElement>(copy.fields.prompt, "textarea"), "Create a poster.");
    await clickButtonAsync(copy.actions.generate);

    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:single-history-failure");
  });

  it("releases its generated preview on unmount", async () => {
    const copy = getTranslations("en-US");
    const runtime = createPreviewRuntime([createSaveImageResult("blob:single-unmount")]);
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(runtimeModule, "getRuntimeAdapter").mockResolvedValue(runtime);
    vi.spyOn(apiClient, "generateImages").mockResolvedValue([{ base64: "image" }]);

    await renderApp();
    setFieldValue(getField<HTMLTextAreaElement>(copy.fields.prompt, "textarea"), "Create a poster.");
    await clickButtonAsync(copy.actions.generate);
    act(() => {
      root.unmount();
    });

    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:single-unmount");
  });

  it("keeps generation active through the StrictMode effect rehearsal and releases its preview on final unmount", async () => {
    const copy = getTranslations("en-US");
    const runtime = createPreviewRuntime([createSaveImageResult("blob:strict-single-unmount")]);
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(runtimeModule, "getRuntimeAdapter").mockResolvedValue(runtime);
    vi.spyOn(apiClient, "generateImages").mockResolvedValue([{ base64: "image" }]);

    await renderApp(true);
    setFieldValue(getField<HTMLTextAreaElement>(copy.fields.prompt, "textarea"), "Create a poster.");
    await clickButtonAsync(copy.actions.generate);

    expect(container.querySelector('.preview-success img[src="blob:strict-single-unmount"]')).not.toBeNull();
    act(() => {
      root.unmount();
    });

    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:strict-single-unmount");
  });

  it("does not save a generated preview when generation resolves after unmount", async () => {
    const copy = getTranslations("en-US");
    const generatedImages = createDeferred<Awaited<ReturnType<typeof apiClient.generateImages>>>();
    const runtime = createPreviewRuntime([createSaveImageResult("blob:single-late-generation")]);
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(runtimeModule, "getRuntimeAdapter").mockResolvedValue(runtime);
    vi.spyOn(apiClient, "generateImages").mockReturnValue(generatedImages.promise);

    await renderApp();
    setFieldValue(getField<HTMLTextAreaElement>(copy.fields.prompt, "textarea"), "Create a poster.");
    clickButton(copy.actions.generate);
    act(() => {
      root.unmount();
    });
    generatedImages.resolve([{ base64: "image" }]);
    await flushPromises();

    expect(runtime.saveImage).not.toHaveBeenCalled();
    expect(revokeObjectUrl).not.toHaveBeenCalled();
  });

  it("releases a saved preview when saving resolves after unmount", async () => {
    const copy = getTranslations("en-US");
    const savedImage = createDeferred<SaveImageResult>();
    const runtime = createPreviewRuntime([]);
    runtime.saveImage = vi.fn().mockReturnValue(savedImage.promise);
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(runtimeModule, "getRuntimeAdapter").mockResolvedValue(runtime);
    vi.spyOn(apiClient, "generateImages").mockResolvedValue([{ base64: "image" }]);

    await renderApp();
    setFieldValue(getField<HTMLTextAreaElement>(copy.fields.prompt, "textarea"), "Create a poster.");
    clickButton(copy.actions.generate);
    await flushPromises();
    act(() => {
      root.unmount();
    });
    savedImage.resolve(createSaveImageResult("blob:single-late-save"));
    await flushPromises();

    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:single-late-save");
  });

  it("releases a history preview when preparation resolves after unmount", async () => {
    const copy = getTranslations("en-US");
    const preparedPreview = createDeferred<string | null>();
    const record = createHistoryRecord({ id: "history-late-preview" });
    const runtime = createPreviewRuntime([], [record]);
    runtime.prepareHistoryPreview = vi.fn().mockReturnValue(preparedPreview.promise);
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(runtimeModule, "getRuntimeAdapter").mockResolvedValue(runtime);

    await renderApp();
    clickButton(copy.tabs.history);
    clickButton(copy.actions.inspect);
    act(() => {
      root.unmount();
    });
    preparedPreview.resolve("blob:history-late-preview");
    await flushPromises();

    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:history-late-preview");
  });

  it("releases a history batch preview when preparation resolves after unmount", async () => {
    const copy = getTranslations("en-US");
    const preparedPreview = createDeferred<string | null>();
    const record = createHistoryRecord({
      id: "history-batch-late-preview",
      batch: {
        id: "batch-late-preview",
        title: "Late preview batch",
        createdAt: "2026-05-24T00:00:00.000Z",
        taskId: "task-late-preview",
        taskIndex: 0,
        taskTitle: "Late preview",
      },
    });
    const runtime = createPreviewRuntime([], [record]);
    runtime.prepareHistoryPreview = vi.fn().mockReturnValue(preparedPreview.promise);
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(runtimeModule, "getRuntimeAdapter").mockResolvedValue(runtime);

    await renderApp();
    clickButton(copy.tabs.history);
    clickButton(copy.actions.inspectBatch);
    act(() => {
      root.unmount();
    });
    preparedPreview.resolve("blob:history-batch-late-preview");
    await flushPromises();

    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:history-batch-late-preview");
  });

  it("releases restored history batch previews when a later preview fails", async () => {
    const copy = getTranslations("en-US");
    const firstRecord = createHistoryRecord({
      id: "history-batch-first",
      batch: {
        id: "batch-partial-preview",
        title: "Partial preview batch",
        createdAt: "2026-05-24T00:00:00.000Z",
        taskId: "task-first",
        taskIndex: 0,
        taskTitle: "First preview",
      },
    });
    const secondRecord = createHistoryRecord({
      id: "history-batch-second",
      createdAt: "2026-05-24T00:02:00.000Z",
      batch: {
        id: "batch-partial-preview",
        title: "Partial preview batch",
        createdAt: "2026-05-24T00:00:00.000Z",
        taskId: "task-second",
        taskIndex: 1,
        taskTitle: "Second preview",
      },
    });
    const runtime = createPreviewRuntime([], [firstRecord, secondRecord]);
    runtime.prepareHistoryPreview = vi
      .fn()
      .mockResolvedValueOnce("blob:history-batch-partial")
      .mockRejectedValueOnce(new Error("Second preview failed."));
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(runtimeModule, "getRuntimeAdapter").mockResolvedValue(runtime);

    await renderApp();
    clickButton(copy.tabs.history);
    clickButton(copy.actions.inspectBatch);
    await flushPromises();

    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:history-batch-partial");
    expect(container.querySelector('img[src="blob:history-batch-partial"]')).toBeNull();
  });

  it("keeps a batch preview URL alive while its lightbox is open", async () => {
    const copy = getTranslations("en-US");
    const runtime = createPreviewRuntime([]);
    runtime.loadConfig = vi.fn().mockResolvedValue({
      ...DEFAULT_CONFIG,
      apiKey: "test-key",
      uiLanguage: "en-US",
      hasDismissedWelcome: true,
      batchDefaultTaskCount: 1,
      batchDefaultIntervalSeconds: 0,
    });
    runtime.saveBatchImage = vi.fn().mockResolvedValue({
      record: createHistoryRecord({ id: "batch-lightbox-record", outputPath: "outputs/batch-lightbox.png" }),
      previewUrl: "blob:batch-lightbox",
      outputPath: "outputs/batch-lightbox.png",
      saveMode: "browser-download",
    });
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(runtimeModule, "getRuntimeAdapter").mockResolvedValue(runtime);
    vi.spyOn(apiClient, "generateImages").mockResolvedValue([{ base64: "image" }]);

    await renderApp();
    clickButton(copy.tabs.batch);
    setFieldValue(getField<HTMLTextAreaElement>(copy.batch.fields.masterPrompt, "textarea"), "Create a poster.");
    clickButton(copy.batch.actions.createTasks);
    await clickButtonAsync(copy.batch.actions.start);
    await flushPromises();
    await flushEffects();

    const previewButton = container.querySelector<HTMLButtonElement>(".batch-preview .preview-frame-button");
    if (!previewButton) {
      throw new Error("Batch preview button not found.");
    }
    act(() => {
      previewButton.click();
    });
    clickButton(copy.batch.actions.clearDraft);
    await flushPromises();

    expect(container.textContent).toContain(copy.batch.emptyTasks);
    expect(container.querySelector('.lightbox-content img[src="blob:batch-lightbox"]')).not.toBeNull();
    expect(revokeObjectUrl).not.toHaveBeenCalled();

    clickButton(copy.actions.close);
    await flushPromises();
    act(() => {
      root.unmount();
    });

    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:batch-lightbox");
  });

  it("keeps BatchPanel as the sole owner when its URL is borrowed by history and single previews", async () => {
    const copy = getTranslations("en-US");
    const record = createHistoryRecord({
      id: "batch-borrowed-record",
      outputPath: "outputs/batch-borrowed.png",
      batch: {
        id: "batch-borrowed-preview",
        title: "Borrowed preview batch",
        createdAt: "2026-05-24T00:00:00.000Z",
        taskId: "task-borrowed-preview",
        taskIndex: 0,
        taskTitle: "Borrowed preview",
      },
    });
    const runtime = createPreviewRuntime([], [record]);
    runtime.loadConfig = vi.fn().mockResolvedValue({
      ...DEFAULT_CONFIG,
      apiKey: "test-key",
      uiLanguage: "en-US",
      hasDismissedWelcome: true,
      batchDefaultTaskCount: 1,
      batchDefaultIntervalSeconds: 0,
    });
    runtime.saveBatchImage = vi.fn().mockResolvedValue({
      record,
      previewUrl: "blob:batch-borrowed",
      outputPath: record.outputPath,
      saveMode: "browser-download",
    });
    runtime.prepareHistoryPreview = vi.fn().mockResolvedValue("blob:batch-borrowed");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(runtimeModule, "getRuntimeAdapter").mockResolvedValue(runtime);
    vi.spyOn(apiClient, "generateImages").mockResolvedValue([{ base64: "image" }]);

    await renderApp();
    clickButton(copy.tabs.batch);
    setFieldValue(getField<HTMLTextAreaElement>(copy.batch.fields.masterPrompt, "textarea"), "Create a poster.");
    clickButton(copy.batch.actions.createTasks);
    await clickButtonAsync(copy.batch.actions.start);
    await flushEffects();

    clickButton(copy.tabs.history);
    await clickButtonAsync(copy.actions.inspectBatch);
    await flushPromises();
    clickButton(copy.actions.expandBatch);
    clickButton(copy.actions.inspect);
    await flushPromises();

    clickButton(copy.tabs.batch);
    clickButton(copy.batch.actions.clearDraft);
    await flushPromises();

    const previewImage = container.querySelector<HTMLImageElement>('.preview-success img[src="blob:batch-borrowed"]');
    if (!previewImage) {
      throw new Error("Borrowed single preview image not found.");
    }
    act(() => {
      previewImage.dispatchEvent(new Event("error"));
    });
    await flushPromises();
    act(() => {
      root.unmount();
    });

    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:batch-borrowed");
  });

  it("does not retain App ownership after partial history restoration borrows a batch URL", async () => {
    const copy = getTranslations("en-US");
    const firstRecord = createHistoryRecord({
      id: "batch-partial-borrowed-first",
      outputPath: "outputs/batch-partial-borrowed-first.png",
      batch: {
        id: "batch-partial-borrowed",
        title: "Partial borrowed preview batch",
        createdAt: "2026-05-24T00:00:00.000Z",
        taskId: "task-partial-borrowed-first",
        taskIndex: 0,
        taskTitle: "First borrowed preview",
      },
    });
    const secondRecord = createHistoryRecord({
      id: "batch-partial-borrowed-second",
      outputPath: "outputs/batch-partial-borrowed-second.png",
      batch: {
        id: "batch-partial-borrowed",
        title: "Partial borrowed preview batch",
        createdAt: "2026-05-24T00:00:00.000Z",
        taskId: "task-partial-borrowed-second",
        taskIndex: 1,
        taskTitle: "Second borrowed preview",
      },
    });
    const runtime = createPreviewRuntime([], [firstRecord, secondRecord]);
    runtime.loadConfig = vi.fn().mockResolvedValue({
      ...DEFAULT_CONFIG,
      apiKey: "test-key",
      uiLanguage: "en-US",
      hasDismissedWelcome: true,
      batchDefaultTaskCount: 1,
      batchDefaultIntervalSeconds: 0,
    });
    runtime.saveBatchImage = vi.fn().mockResolvedValue({
      record: firstRecord,
      previewUrl: "blob:batch-partial-borrowed",
      outputPath: firstRecord.outputPath,
      saveMode: "browser-download",
    });
    runtime.prepareHistoryPreview = vi
      .fn()
      .mockResolvedValueOnce("blob:batch-partial-borrowed")
      .mockRejectedValueOnce(new Error("Second preview failed."));
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(runtimeModule, "getRuntimeAdapter").mockResolvedValue(runtime);
    vi.spyOn(apiClient, "generateImages").mockResolvedValue([{ base64: "image" }]);

    await renderApp();
    clickButton(copy.tabs.batch);
    setFieldValue(getField<HTMLTextAreaElement>(copy.batch.fields.masterPrompt, "textarea"), "Create a poster.");
    clickButton(copy.batch.actions.createTasks);
    await clickButtonAsync(copy.batch.actions.start);
    await flushEffects();

    clickButton(copy.tabs.history);
    await clickButtonAsync(copy.actions.inspectBatch);
    await flushPromises();

    clickButton(copy.tabs.batch);
    clickButton(copy.batch.actions.clearDraft);
    await flushPromises();
    act(() => {
      root.unmount();
    });

    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:batch-partial-borrowed");
  });

  it("does not revoke a shared single preview when history batch restoration later fails", async () => {
    const copy = getTranslations("en-US");
    const firstRecord = createHistoryRecord({
      id: "history-shared-first",
      batch: {
        id: "batch-shared-preview",
        title: "Shared preview batch",
        createdAt: "2026-05-24T00:00:00.000Z",
        taskId: "task-shared-first",
        taskIndex: 0,
        taskTitle: "First shared preview",
      },
    });
    const secondRecord = createHistoryRecord({
      id: "history-shared-second",
      createdAt: "2026-05-24T00:02:00.000Z",
      batch: {
        id: "batch-shared-preview",
        title: "Shared preview batch",
        createdAt: "2026-05-24T00:00:00.000Z",
        taskId: "task-shared-second",
        taskIndex: 1,
        taskTitle: "Second shared preview",
      },
    });
    const runtime = createPreviewRuntime([createSaveImageResult("blob:shared-preview")], [firstRecord, secondRecord]);
    runtime.prepareHistoryPreview = vi
      .fn()
      .mockResolvedValueOnce("blob:shared-preview")
      .mockRejectedValueOnce(new Error("Second preview failed."));
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(runtimeModule, "getRuntimeAdapter").mockResolvedValue(runtime);
    vi.spyOn(apiClient, "generateImages").mockResolvedValue([{ base64: "image" }]);

    await renderApp();
    setFieldValue(getField<HTMLTextAreaElement>(copy.fields.prompt, "textarea"), "Create a poster.");
    await clickButtonAsync(copy.actions.generate);
    clickButton(copy.tabs.history);
    clickButton(copy.actions.inspectBatch);
    await flushPromises();

    expect(container.querySelector('.preview-success img[src="blob:shared-preview"]')).not.toBeNull();
    expect(revokeObjectUrl).not.toHaveBeenCalled();
  });

  it("keeps batch draft fields mounted when switching between tabs", async () => {
    const copy = getTranslations("en-US");

    await act(async () => {
      root.render(<App />);
    });
    await flushEffects();

    clickButton(copy.tabs.batch);
    setFieldValue(getField<HTMLInputElement>(copy.batch.fields.batchTitle, "input"), "World Cup set");
    setFieldValue(getField<HTMLTextAreaElement>(copy.batch.fields.masterPrompt, "textarea"), "France / Japan posters");
    setFieldValue(getField<HTMLInputElement>(copy.batch.fields.taskCount, 'input[type="number"]'), "4");

    clickButton(copy.tabs.history);
    clickButton(copy.tabs.batch);

    expect(getField<HTMLInputElement>(copy.batch.fields.batchTitle, "input").value).toBe("World Cup set");
    expect(getField<HTMLTextAreaElement>(copy.batch.fields.masterPrompt, "textarea").value).toBe(
      "France / Japan posters",
    );
    expect(getField<HTMLInputElement>(copy.batch.fields.taskCount, 'input[type="number"]').value).toBe("4");
  });

  it("labels the single-image workspace separately from batch generation", async () => {
    await act(async () => {
      root.render(<App />);
    });
    await flushEffects();

    const tabLabels = Array.from(container.querySelectorAll('.tab-strip [role="tab"]')).map((tab) =>
      tab.textContent?.trim(),
    );

    expect(tabLabels).toContain("Single image");
    expect(tabLabels).not.toContain("Generate");
  });

  it("marks the active workspace tab on the app shell for responsive layouts", async () => {
    const copy = getTranslations("en-US");

    await act(async () => {
      root.render(<App />);
    });
    await flushEffects();

    const appShell = container.querySelector(".app-shell");

    expect(appShell?.classList.contains("tab-generate")).toBe(true);

    clickButton(copy.tabs.batch);
    expect(appShell?.classList.contains("tab-batch")).toBe(true);

    clickButton(copy.tabs.history);
    expect(appShell?.classList.contains("tab-history")).toBe(true);

    clickButton(copy.tabs.settings);
    expect(appShell?.classList.contains("tab-settings")).toBe(true);
  });

  it("shows batch task status in the right preview panel", async () => {
    const copy = getTranslations("en-US");

    await act(async () => {
      root.render(<App />);
    });
    await flushEffects();

    clickButton(copy.tabs.batch);
    setFieldValue(getField<HTMLTextAreaElement>(copy.batch.fields.masterPrompt, "textarea"), "Create football posters.");
    clickButton(copy.batch.actions.createTasks);

    const previewPanel = container.querySelector(".preview-panel");

    expect(previewPanel?.textContent).toContain("Batch preview");
    expect(previewPanel?.textContent).toContain("Total");
    expect(previewPanel?.textContent).toContain("5");

    clickButton(copy.batch.actions.clearDraft);

    expect(previewPanel?.textContent).not.toContain("Batch preview");
  });

  it("shows a GitHub project link in the header", async () => {
    const copy = getTranslations("en-US");

    await act(async () => {
      root.render(<App />);
    });
    await flushEffects();

    const githubLink = container.querySelector<HTMLAnchorElement>(
      'a[href="https://github.com/KDB-Wind/gpt-image-2-studio"]',
    );

    expect(githubLink).not.toBeNull();
    expect(githubLink?.textContent?.trim()).toBe("GitHub");
    expect(githubLink?.getAttribute("aria-label")).toBe(copy.actions.openGithubProject);
    expect(githubLink?.querySelector(".github-icon")).not.toBeNull();
    expect(githubLink?.textContent).not.toContain("Star");
    expect(githubLink?.target).toBe("_blank");
    expect(githubLink?.rel).toContain("noreferrer");
  });

  it("exposes visual image ratio, resolution, and quality controls inside the generation workspace", async () => {
    const copy = getTranslations("en-US");

    await act(async () => {
      root.render(<App />);
    });
    await flushEffects();

    const visibleQuickOptions = getVisibleQuickOptions();

    expect(visibleQuickOptions.textContent).toContain(copy.quickOptions.title);
    expect(visibleQuickOptions.textContent).toContain(copy.quickOptions.aspect);
    expect(visibleQuickOptions.textContent).toContain(copy.quickOptions.resolution);
    expect(visibleQuickOptions.textContent).toContain(copy.quickOptions.ratioSquare);
    expect(visibleQuickOptions.textContent).toContain(copy.quickOptions.resolution4k);
    expect(visibleQuickOptions.textContent).toContain(copy.options.qualityAuto);

    clickButton(copy.quickOptions.ratioPortrait);
    clickButton(copy.quickOptions.resolution4k);
    clickButton(copy.options.qualityHigh);

    expect(visibleQuickOptions.textContent).toContain(copy.quickOptions.ratioPortrait);
    expect(visibleQuickOptions.textContent).toContain(copy.quickOptions.resolution4k);
    expect(visibleQuickOptions.textContent).toContain(copy.options.qualityHigh);

    clickButton(copy.tabs.batch);

    const batchQuickOptions = getVisibleQuickOptions();

    expect(batchQuickOptions.textContent).toContain(copy.quickOptions.ratioPortrait);
    expect(batchQuickOptions.textContent).toContain(copy.quickOptions.resolution4k);
    expect(batchQuickOptions.textContent).toContain(copy.options.qualityHigh);
  });

  it("does not expose the author support payment entry in the public tool", async () => {
    await act(async () => {
      root.render(<App />);
    });
    await flushEffects();

    expect(container.querySelector(".support-fab")).toBeNull();
    expect(container.textContent).not.toContain("Buy the author a cola");
  });

  it("shows the vector app logo in the header", async () => {
    await act(async () => {
      root.render(<App />);
    });
    await flushEffects();

    const logo = container.querySelector<SVGSVGElement>(".app-logo");

    expect(logo).not.toBeNull();
    expect(logo?.tagName.toLowerCase()).toBe("svg");
    expect(logo?.getAttribute("viewBox")).toBe("0 0 1024 1024");
    expect(logo?.getAttribute("aria-hidden")).toBe("true");
  });

  it("shows an open-source project card in settings", async () => {
    const copy = getTranslations("en-US");

    await act(async () => {
      root.render(<App />);
    });
    await flushEffects();

    clickButton(copy.tabs.settings);

    expect(container.textContent).toContain(copy.cards.openSourceTitle);
    expect(container.textContent).toContain(copy.cards.openSourceHint);
    expect(container.querySelector('a[href="https://github.com/KDB-Wind/gpt-image-2-studio"]')).not.toBeNull();
    expect(
      container.querySelector('a[href="https://github.com/KDB-Wind/gpt-image-2-studio#最小-api-调用示例"]'),
    ).not.toBeNull();
    expect(container.querySelector('a[href="https://kdb-wind.github.io/gpt-image-2-studio/"]')).not.toBeNull();
    expect(
      container.querySelector(
        `a[href="https://kdb-wind.github.io/gpt-image-2-studio/versions/v${staticVersionManifest.latestStable}/"]`,
      ),
    ).not.toBeNull();
  });

  it("groups batch history records into an expandable batch card", async () => {
    const copy = getTranslations("en-US");
    window.localStorage.setItem(
      "chat-to-image.history.v1",
      JSON.stringify([
        createHistoryRecord({
          id: "record-france",
          prompt: "Create a France poster.",
          outputPath: "outputs/2026-05-24/batch/france.png",
          batch: {
            id: "batch-world-cup",
            title: "World Cup posters",
            createdAt: "2026-05-24T00:00:00.000Z",
            taskId: "task-1",
            taskIndex: 0,
            taskTitle: "France poster",
            totalTasks: 2,
          },
        }),
        createHistoryRecord({
          id: "record-japan",
          prompt: "Create a Japan poster.",
          outputPath: "outputs/2026-05-24/batch/japan.png",
          batch: {
            id: "batch-world-cup",
            title: "World Cup posters",
            createdAt: "2026-05-24T00:00:00.000Z",
            taskId: "task-2",
            taskIndex: 1,
            taskTitle: "Japan poster",
            totalTasks: 2,
          },
        }),
      ]),
    );

    await act(async () => {
      root.render(<App />);
    });
    await flushEffects();

    const batchCard = container.querySelector(".history-batch-card");

    expect(batchCard?.textContent).toContain("World Cup posters");
    expect(batchCard?.textContent).toContain("2 / 2");
    expect(batchCard?.textContent).not.toContain("Create a France poster.");

    clickButton(copy.actions.expandBatch);

    expect(batchCard?.textContent).toContain("Create a France poster.");
    expect(batchCard?.textContent).toContain("Create a Japan poster.");
  });

  it("shows an output directory verification action in settings", async () => {
    const copy = getTranslations("en-US");

    await act(async () => {
      root.render(<App />);
    });
    await flushEffects();

    clickButton(copy.tabs.settings);

    expect(container.textContent).toContain(copy.actions.testOutputDirectory);
  });

  it("shows a first-run setup checklist before the user starts generating", async () => {
    window.localStorage.setItem(
      "chat-to-image.config.v1",
      JSON.stringify({ ...DEFAULT_CONFIG, uiLanguage: "en-US", hasDismissedWelcome: false }),
    );

    await act(async () => {
      root.render(<App />);
    });
    await flushEffects();

    const checklist = container.querySelector(".welcome-checklist");

    expect(checklist).not.toBeNull();
    expect(checklist?.textContent).toContain("Setup checklist");
    expect(checklist?.textContent).toContain("Fill Base URL and API key");
    expect(checklist?.textContent).toContain("Choose and authorize an output folder");
    expect(checklist?.textContent).toContain("Run Test output folder");
    expect(checklist?.textContent).toContain("Set timeout between 60 and 600 seconds");
    expect(checklist?.textContent).toContain("Start with Single image, then use Batch");
  });

  it("exposes timeout as a user controlled setting with safe bounds", async () => {
    const copy = getTranslations("en-US");

    await act(async () => {
      root.render(<App />);
    });
    await flushEffects();

    clickButton(copy.tabs.settings);

    const timeoutInput = getField<HTMLInputElement>(copy.fields.timeoutSeconds, 'input[type="number"]');

    expect(timeoutInput.value).toBe("180");
    expect(timeoutInput.min).toBe("60");
    expect(timeoutInput.max).toBe("600");
    expect(container.textContent).toContain("Timeout accepts 60-600 seconds");
  });

  it("does not expose a hidden multi-output control", async () => {
    const copy = getTranslations("en-US");

    await act(async () => {
      root.render(<App />);
    });
    await flushEffects();
    clickButton(copy.tabs.settings);

    expect(container.textContent).toContain(copy.notes.oneImagePerTask);
    expect(() => getField<HTMLInputElement>(copy.fields.imageCount, 'input[type="number"]')).toThrow();
  });

  it("renders and persists the image response compatibility mode setting", async () => {
    const copy = getTranslations("en-US");

    await act(async () => {
      root.render(<App />);
    });
    await flushEffects();

    clickButton(copy.tabs.settings);

    const modeSelect = getField<HTMLSelectElement>(copy.fields.imageResponseMode, "select");

    expect(modeSelect.value).toBe("official");
    expect(Array.from(modeSelect.options).map((option) => option.textContent)).toEqual([
      copy.options.imageResponseModeOfficial,
      copy.options.imageResponseModeForceBase64,
    ]);
    expect(container.textContent).toContain(copy.notes.imageResponseModeHint);

    setSelectValue(modeSelect, "force-base64");
    expect(modeSelect.value).toBe("force-base64");

    clickButton(copy.actions.save);
    await flushEffects();

    const savedConfig = JSON.parse(window.localStorage.getItem("chat-to-image.config.v1") ?? "{}");
    expect(savedConfig.imageResponseMode).toBe("force-base64");
  });

  it("migrates an unknown stored image response mode back to official", () => {
    expect(DEFAULT_CONFIG.imageResponseMode).toBe("official");
    expect(mergeConfig({ imageResponseMode: "provider-specific" as never }).imageResponseMode).toBe("official");
  });

  it("remembers the API key only after explicit opt-in", async () => {
    const copy = getTranslations("en-US");

    await act(async () => {
      root.render(<App />);
    });
    await flushEffects();
    clickButton(copy.tabs.settings);

    const apiKeyInput = getField<HTMLInputElement>(copy.fields.apiKey, 'input[type="password"]');
    const rememberToggle = container.querySelector<HTMLInputElement>('[data-testid="settings-remember-api-key"]');
    if (!rememberToggle) {
      throw new Error(`Field not found: ${copy.fields.rememberApiKey}`);
    }
    expect(rememberToggle.checked).toBe(false);

    setFieldValue(apiKeyInput, REMEMBERED_UI_API_KEY);
    act(() => {
      rememberToggle.click();
    });
    clickButton(copy.actions.save);
    await flushEffects();

    const storedConfig = JSON.parse(window.localStorage.getItem("chat-to-image.config.v1") ?? "{}");
    expect(storedConfig.apiKey).toBeUndefined();
    expect(storedConfig.rememberApiKey).toBe(true);
    expect(window.localStorage.getItem("chat-to-image.api-key.persistent.v1")).toContain(
      REMEMBERED_UI_API_KEY,
    );
  });

  it("shows memory-only storage truthfully and disables long-term API key storage", async () => {
    const copy = getTranslations("en-US");
    const runtime = createPreviewRuntime([]) as RuntimeAdapter & {
      getStorageCapabilities(): Promise<{ local: boolean; session: boolean }>;
    };
    runtime.loadConfig = vi.fn().mockResolvedValue({
      ...DEFAULT_CONFIG,
      apiKey: "test-value-not-a-secret",
      rememberApiKey: true,
      uiLanguage: "en-US",
      hasDismissedWelcome: true,
    });
    runtime.getStorageCapabilities = vi.fn().mockResolvedValue({ local: false, session: false });
    vi.spyOn(runtimeModule, "getRuntimeAdapter").mockResolvedValue(runtime);

    await act(async () => {
      root.render(<App />);
    });
    await flushEffects();
    clickButton(copy.tabs.settings);

    const rememberToggle = container.querySelector<HTMLInputElement>('[data-testid="settings-remember-api-key"]');
    expect(rememberToggle?.disabled).toBe(true);
    expect(rememberToggle?.checked).toBe(false);
    expect(container.textContent).toContain("memory only for this open page");
    expect(container.textContent).not.toContain("browser session");
    expect(container.textContent).not.toContain("long-term storage");
  });

  function clickButton(label: string) {
    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.trim() === label,
    );

    if (!button) {
      throw new Error(`Button not found: ${label}`);
    }

    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

  async function clickButtonAsync(label: string) {
    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.trim() === label,
    );

    if (!button) {
      throw new Error(`Button not found: ${label}`);
    }

    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
  }

  async function renderApp(strictMode = false) {
    await act(async () => {
      root.render(strictMode ? <StrictMode><App /></StrictMode> : <App />);
    });
    await flushEffects();
  }

  function getField<T extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    labelText: string,
    selector: string,
  ): T {
    const label = Array.from(container.querySelectorAll("label.field")).find(
      (candidate) => candidate.querySelector("span")?.textContent === labelText,
    );
    const field = label?.querySelector(selector);

    if (!field) {
      throw new Error(`Field not found: ${labelText}`);
    }

    return field as T;
  }

  function getVisibleQuickOptions(): HTMLElement {
    const control = Array.from(container.querySelectorAll<HTMLElement>(".quick-output-options")).find(
      (candidate) => !candidate.closest("[hidden]"),
    );

    if (!control) {
      throw new Error("Visible quick output options not found");
    }

    return control;
  }
});

async function flushEffects() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

function setFieldValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(element.constructor.prototype, "value")?.set;
  act(() => {
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function createHistoryRecord(overrides: Partial<ImageRecord>): ImageRecord {
  return {
    id: "record",
    status: "success",
    createdAt: "2026-05-24T00:01:00.000Z",
    prompt: "Create poster.",
    optimizedPrompt: "",
    model: "gpt-image-2",
    size: "1024x1024",
    outputPath: "outputs/2026-05-24/poster.png",
    durationMs: 1000,
    ...overrides,
  };
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function createPreviewRuntime(saveResults: SaveImageResult[], history: ImageRecord[] = []): RuntimeAdapter {
  return {
    mode: "web",
    loadConfig: vi.fn().mockResolvedValue({
      ...DEFAULT_CONFIG,
      apiKey: "test-key",
      uiLanguage: "en-US",
      hasDismissedWelcome: true,
    }),
    saveConfig: vi.fn().mockResolvedValue(undefined),
    loadHistory: vi.fn().mockResolvedValue(history),
    deleteHistoryRecords: vi.fn().mockResolvedValue([]),
    saveImage: vi.fn().mockImplementation(async () => {
      const result = saveResults.shift();
      if (!result) {
        throw new Error("No preview save result configured.");
      }
      return result;
    }),
    saveBatchImage: vi.fn(),
    saveBatchManifest: vi.fn().mockResolvedValue("batch.json"),
    chooseOutputDirectory: vi.fn().mockResolvedValue(null),
    prepareHistoryPreview: vi.fn().mockResolvedValue(null),
    prepareHistoryFile: vi.fn().mockResolvedValue(null),
    getOutputDirectoryState: vi.fn().mockResolvedValue({ status: "not-authorized" }),
    testOutputDirectory: vi.fn().mockResolvedValue({ ok: true }),
    openOutputPath: vi.fn().mockResolvedValue(undefined),
  };
}

function createSaveImageResult(previewUrl: string): SaveImageResult {
  return {
    previewUrl,
    saveMode: "browser-download",
    record: createHistoryRecord({ id: previewUrl, outputPath: `${previewUrl}.png` }),
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function setSelectValue(element: HTMLSelectElement | undefined, value: string) {
  if (!element) {
    throw new Error("Select not found");
  }

  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  act(() => {
    setter?.call(element, value);
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
