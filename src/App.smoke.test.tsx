import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { DEFAULT_CONFIG, type AppConfig } from "./core/config";
import type { ImageRecord } from "./core/history";
import { MAX_PROVIDER_PROFILES, type ProviderProfile } from "./core/providerProfiles";
import { getTranslations } from "./i18n/translations";
import type { OutputDirectoryState, RuntimeAdapter } from "./runtime/types";

const runtimeMock = vi.hoisted(() => ({
  adapter: null as RuntimeAdapter | null,
  saveConfig: vi.fn<(_: AppConfig) => Promise<void>>(),
  chooseOutputDirectory: vi.fn<() => Promise<string | null>>(),
}));

vi.mock("./runtime", () => ({
  getRuntimeAdapter: () => {
    if (!runtimeMock.adapter) {
      throw new Error("Runtime mock was not configured.");
    }

    return Promise.resolve(runtimeMock.adapter);
  },
}));

function createMockRuntime(
  config: Partial<AppConfig> = {},
  options: {
    history?: ImageRecord[];
    outputDirectoryState?: OutputDirectoryState;
    prepareHistoryPreview?: RuntimeAdapter["prepareHistoryPreview"];
    prepareHistoryFile?: RuntimeAdapter["prepareHistoryFile"];
  } = {},
): RuntimeAdapter {
  const mergedConfig = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  return {
    mode: "web",
    loadConfig: async () => mergedConfig,
    saveConfig: runtimeMock.saveConfig,
    loadHistory: async () => options.history ?? [],
    deleteHistoryRecords: async () => [],
    saveImage: async () => {
      throw new Error("saveImage is not used in smoke tests.");
    },
    saveBatchImage: async () => {
      throw new Error("saveBatchImage is not used in smoke tests.");
    },
    saveBatchManifest: async () => "manifest.json",
    chooseOutputDirectory: runtimeMock.chooseOutputDirectory,
    prepareHistoryPreview: options.prepareHistoryPreview ?? (async () => null),
    prepareHistoryFile: options.prepareHistoryFile ?? (async () => null),
    getOutputDirectoryState: async () => options.outputDirectoryState ?? { status: "not-authorized" },
    testOutputDirectory: async () => ({ ok: true }),
    openOutputPath: async () => undefined,
  };
}

async function flushAppEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("App smoke", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    runtimeMock.saveConfig.mockReset();
    runtimeMock.chooseOutputDirectory.mockReset();
    runtimeMock.chooseOutputDirectory.mockResolvedValue(null);
    runtimeMock.adapter = createMockRuntime();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn((file: File) => `blob:${file.name}`),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    runtimeMock.adapter = null;
    vi.restoreAllMocks();
  });

  it("renders the core workspace with local runtime state", async () => {
    await act(async () => {
      root.render(<App />);
    });
    await flushAppEffects();

    expect(container.querySelector(".app-shell")).not.toBeNull();
    expect(container.querySelector(".workspace-grid")).not.toBeNull();
    expect(container.querySelector(".control-panel")).not.toBeNull();
    expect(container.querySelector(".preview-panel")).not.toBeNull();
    expect(container.querySelector(".history-panel")).not.toBeNull();
    expect(container.querySelectorAll(".tab-button")).toHaveLength(4);
    expect(container.querySelector(".modal-card.welcome-modal")).not.toBeNull();
    expect(container.querySelector(".modal-card.wide")).toBeNull();
  });

  it("persists language changes and keeps the public page free of support payment UI", async () => {
    await act(async () => {
      root.render(<App />);
    });
    await flushAppEffects();

    const englishButton = Array.from(container.querySelectorAll(".language-switch button")).find(
      (button) => button.textContent === "English",
    ) as HTMLButtonElement | undefined;
    expect(englishButton).toBeDefined();

    await act(async () => {
      englishButton?.click();
    });

    expect(runtimeMock.saveConfig).toHaveBeenCalledWith(expect.objectContaining({ uiLanguage: "en-US" }));
    expect(container.textContent).toContain("Generate image");

    const welcomeStartButton = container.querySelector(".modal-footer .primary-button") as HTMLButtonElement | null;
    expect(welcomeStartButton).not.toBeNull();

    await act(async () => {
      welcomeStartButton?.click();
    });
    await flushAppEffects();

    expect(container.querySelector(".support-fab")).toBeNull();
    expect(container.textContent).not.toContain("Buy the author a cola");
  });

  it.each([
    {
      name: "configuration validation fails",
      config: { apiKey: "" },
      outputDirectoryState: {
        status: "ready",
        name: "gpt-image-2-studio",
        lastTestedAt: "2026-07-13T08:00:00.000Z",
      } satisfies OutputDirectoryState,
    },
    {
      name: "output directory is not ready",
      config: { apiKey: "test-key" },
      outputDirectoryState: { status: "not-authorized" } satisfies OutputDirectoryState,
    },
  ])("routes the welcome primary action to settings when $name", async ({ config, outputDirectoryState }) => {
    const copy = getTranslations("en-US");
    runtimeMock.adapter = createMockRuntime(
      { ...config, uiLanguage: "en-US" },
      { outputDirectoryState },
    );

    await act(async () => {
      root.render(<App />);
    });
    await flushAppEffects();

    expect(container.querySelector(".modal-footer .primary-button")?.textContent).toBe(copy.actions.goToSettings);

    await act(async () => {
      clickButton(container, copy.actions.goToSettings);
      await Promise.resolve();
    });
    await flushAppEffects();

    expect(runtimeMock.saveConfig).toHaveBeenCalledWith(expect.objectContaining({ hasDismissedWelcome: true }));
    expect(container.querySelector(".app-shell")?.classList.contains("tab-settings")).toBe(true);
  });

  it("routes the welcome primary action to single-image generation when setup is complete", async () => {
    const copy = getTranslations("en-US");
    runtimeMock.adapter = createMockRuntime(
      { apiKey: "test-key", uiLanguage: "en-US" },
      {
        outputDirectoryState: {
          status: "ready",
          name: "gpt-image-2-studio",
          lastTestedAt: "2026-07-13T08:00:00.000Z",
        },
      },
    );

    await act(async () => {
      root.render(<App />);
    });
    await flushAppEffects();

    await act(async () => {
      clickButton(container, copy.tabs.settings);
    });
    expect(container.querySelector(".app-shell")?.classList.contains("tab-settings")).toBe(true);
    expect(container.querySelector(".modal-footer .primary-button")?.textContent).toBe(copy.actions.startUsing);

    await act(async () => {
      clickButton(container, copy.actions.startUsing);
      await Promise.resolve();
    });
    await flushAppEffects();

    expect(runtimeMock.saveConfig).toHaveBeenCalledWith(expect.objectContaining({ hasDismissedWelcome: true }));
    expect(container.querySelector(".app-shell")?.classList.contains("tab-generate")).toBe(true);
  });

  it("persists the selected output directory immediately after folder authorization", async () => {
    const copy = getTranslations("en-US");
    runtimeMock.chooseOutputDirectory.mockResolvedValue("gpt-image-2-studio");
    runtimeMock.adapter = createMockRuntime({ uiLanguage: "en-US", hasDismissedWelcome: true });

    await act(async () => {
      root.render(<App />);
    });
    await flushAppEffects();

    await act(async () => {
      clickButton(container, copy.tabs.settings);
    });
    await flushAppEffects();

    await act(async () => {
      clickButton(container, copy.actions.chooseDirectory);
      await Promise.resolve();
    });
    await flushAppEffects();

    expect(runtimeMock.saveConfig).toHaveBeenCalledWith(
      expect.objectContaining({ outputDirectory: "gpt-image-2-studio" }),
    );
  });

  it("explains that the recorded output folder still needs a write/read test", async () => {
    const copy = getTranslations("en-US");
    runtimeMock.chooseOutputDirectory.mockResolvedValue("gpt-image-2-studio");
    runtimeMock.adapter = createMockRuntime({ uiLanguage: "en-US", hasDismissedWelcome: true });

    await act(async () => {
      root.render(<App />);
    });
    await flushAppEffects();

    await act(async () => {
      clickButton(container, copy.tabs.settings);
    });
    await flushAppEffects();

    const statusBefore = container.querySelector(".output-directory-status");
    expect(statusBefore?.textContent).toContain("No output folder is authorized yet.");

    await act(async () => {
      clickButton(container, copy.actions.chooseDirectory);
      await Promise.resolve();
    });
    await flushAppEffects();

    const statusAfter = container.querySelector(".output-directory-status");
    expect(statusAfter?.textContent).toContain("No output folder is authorized yet.");
  });

  it("renders the runtime directory state and refreshes it after a directory test", async () => {
    const copy = getTranslations("en-US");
    const getOutputDirectoryState = vi
      .fn<() => Promise<OutputDirectoryState>>()
      .mockResolvedValueOnce({ status: "ready", name: "gpt-image-2-studio", lastTestedAt: "2026-07-11T08:00:00.000Z" })
      .mockResolvedValueOnce({ status: "permission-required", name: "gpt-image-2-studio" });
    runtimeMock.adapter = {
      ...createMockRuntime({ uiLanguage: "en-US", hasDismissedWelcome: true }),
      getOutputDirectoryState,
      testOutputDirectory: vi.fn().mockResolvedValue({ ok: false, message: "Permission revoked." }),
    };

    await act(async () => {
      root.render(<App />);
    });
    await flushAppEffects();

    await act(async () => {
      clickButton(container, copy.tabs.settings);
    });
    await flushAppEffects();

    expect(container.querySelector(".output-directory-status")?.textContent).toContain("Ready");
    expect(container.querySelector(".output-directory-status")?.textContent).toContain("gpt-image-2-studio");
    expect(container.querySelector(".output-directory-status")?.textContent).toContain("2026-07-11T08:00:00.000Z");

    await act(async () => {
      clickButton(container, copy.actions.testOutputDirectory);
      await Promise.resolve();
    });
    await flushAppEffects();

    expect(getOutputDirectoryState).toHaveBeenCalledTimes(2);
    expect(container.querySelector(".output-directory-status")?.textContent).toContain("Needs permission");
  });

  it("finishes app initialization when the output-directory state query rejects", async () => {
    const copy = getTranslations("en-US");
    runtimeMock.adapter = {
      ...createMockRuntime({ uiLanguage: "en-US", hasDismissedWelcome: true }),
      getOutputDirectoryState: vi.fn().mockRejectedValue(new DOMException("Blocked", "SecurityError")),
    };

    await act(async () => {
      root.render(<App />);
    });
    await flushAppEffects();

    expect(container.querySelector(".app-shell")).not.toBeNull();
    await act(async () => {
      clickButton(container, copy.tabs.settings);
    });
    await flushAppEffects();
    expect(container.textContent).toContain(copy.messages.runtimeLoaded("Web mode"));
    expect(container.textContent).not.toContain("Failed to load local state");
  });

  it("ignores stale output-directory refresh results and does not update state after unmount", async () => {
    const copy = getTranslations("en-US");
    const initialState: OutputDirectoryState = { status: "not-authorized" };
    const staleRefresh = createDeferred<OutputDirectoryState>();
    const latestRefresh = createDeferred<OutputDirectoryState>();
    const getOutputDirectoryState = vi
      .fn<() => Promise<OutputDirectoryState>>()
      .mockResolvedValueOnce(initialState)
      .mockImplementationOnce(() => staleRefresh.promise)
      .mockImplementationOnce(() => latestRefresh.promise);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    runtimeMock.chooseOutputDirectory.mockResolvedValue("gpt-image-2-studio");
    runtimeMock.adapter = {
      ...createMockRuntime({ uiLanguage: "en-US", hasDismissedWelcome: true }),
      getOutputDirectoryState,
      testOutputDirectory: vi.fn().mockResolvedValue({ ok: false, message: "Permission revoked." }),
    };

    await act(async () => {
      root.render(<App />);
    });
    await flushAppEffects();

    await act(async () => {
      clickButton(container, copy.tabs.settings);
    });
    await flushAppEffects();

    await act(async () => {
      clickButton(container, copy.actions.chooseDirectory);
      await Promise.resolve();
    });

    await act(async () => {
      clickButton(container, copy.actions.testOutputDirectory);
      await Promise.resolve();
    });

    await act(async () => {
      latestRefresh.resolve({ status: "permission-required", name: "gpt-image-2-studio" });
      await latestRefresh.promise;
    });
    await flushAppEffects();

    expect(container.querySelector(".output-directory-status")?.textContent).toContain("Needs permission");

    act(() => {
      root.unmount();
    });

    runtimeMock.adapter = createMockRuntime({ uiLanguage: "en-US", hasDismissedWelcome: true });
    root = createRoot(container);
    await act(async () => {
      root.render(<App />);
    });
    await flushAppEffects();
    await act(async () => {
      clickButton(container, copy.tabs.settings);
    });
    await flushAppEffects();
    const replacementStatus = container.querySelector(".output-directory-status")?.textContent;

    await act(async () => {
      staleRefresh.resolve({ status: "ready", name: "gpt-image-2-studio", lastTestedAt: "2026-07-11T08:00:00.000Z" });
      await staleRefresh.promise;
      await Promise.resolve();
    });

    expect(consoleError).not.toHaveBeenCalled();
    expect(container.querySelector(".output-directory-status")?.textContent).toBe(replacementStatus);
  });

  it("keeps low-frequency guidance collapsed in the single image and settings panels", async () => {
    const copy = getTranslations("en-US");
    runtimeMock.adapter = createMockRuntime({ uiLanguage: "en-US", hasDismissedWelcome: true });

    await act(async () => {
      root.render(<App />);
    });
    await flushAppEffects();

    const imageOptions = container.querySelector<HTMLDetailsElement>("details.quick-output-options");
    expect(imageOptions).not.toBeNull();
    expect(imageOptions?.open).toBe(false);
    expect(imageOptions?.querySelector(".quick-output-options-note")).not.toBeNull();

    await act(async () => {
      clickButton(container, copy.modes.imageToImage);
    });
    await flushAppEffects();

    const referenceHelp = container.querySelector<HTMLDetailsElement>("details.reference-help-details");
    expect(referenceHelp).not.toBeNull();
    expect(referenceHelp?.open).toBe(false);
    expect(referenceHelp?.querySelector("summary")?.textContent).toContain("Reference image notes");

    await act(async () => {
      clickButton(container, copy.tabs.settings);
    });
    await flushAppEffects();

    const settingsHelpDetails = Array.from(container.querySelectorAll<HTMLDetailsElement>("details.settings-help-details"));
    expect(settingsHelpDetails).toHaveLength(4);
    expect(settingsHelpDetails.every((details) => details.open === false)).toBe(true);
    expect(settingsHelpDetails.map((details) => details.querySelector("summary")?.textContent)).toEqual([
      "Connection notes",
      "Default parameter notes",
      "Output folder notes",
      "Image-to-image test notes",
    ]);
  });

  it("keeps the final provider profile and enforces the profile limit", async () => {
    const copy = getTranslations("en-US");
    runtimeMock.adapter = createMockRuntime({ uiLanguage: "en-US", hasDismissedWelcome: true });

    await act(async () => {
      root.render(<App />);
    });
    await flushAppEffects();
    await act(async () => {
      clickButton(container, copy.tabs.settings);
    });

    const deleteButton = getButton(container, copy.actions.deleteProviderProfile);
    expect(deleteButton.disabled).toBe(true);
    expect(container.querySelectorAll('[data-testid="settings-provider-profile"] option')).toHaveLength(1);

    const profiles = Array.from({ length: MAX_PROVIDER_PROFILES }, (_, index) =>
      createProviderProfile(index + 1),
    );
    runtimeMock.adapter = createMockRuntime({
      uiLanguage: "en-US",
      hasDismissedWelcome: true,
      providerProfiles: profiles,
      activeProviderProfileId: profiles[0].id,
      ...profiles[0],
    });

    act(() => root.unmount());
    root = createRoot(container);
    await act(async () => {
      root.render(<App />);
    });
    await flushAppEffects();
    await act(async () => {
      clickButton(container, copy.tabs.settings);
    });

    expect(getButton(container, copy.actions.createProviderProfile).disabled).toBe(true);
    expect(container.querySelectorAll('[data-testid="settings-provider-profile"] option')).toHaveLength(
      MAX_PROVIDER_PROFILES,
    );
  });

  it("starts image-to-image editing from a saved history image", async () => {
    const copy = getTranslations("en-US");
    const record = createHistoryRecord({
      id: "history-france",
      prompt: "Create a France World Cup poster.",
      outputPath: "outputs/2026-05-26/france.png",
    });
    const prepareHistoryFile = vi.fn().mockResolvedValue(new File(["image"], "france.png", { type: "image/png" }));
    runtimeMock.adapter = createMockRuntime(
      { uiLanguage: "en-US", hasDismissedWelcome: true },
      { history: [record], prepareHistoryFile },
    );

    await act(async () => {
      root.render(<App />);
    });
    await flushAppEffects();

    await act(async () => {
      clickButton(container, copy.tabs.history);
    });
    await flushAppEffects();

    await act(async () => {
      clickButton(container, copy.actions.editFromImage);
      await Promise.resolve();
    });
    await flushAppEffects();

    expect(prepareHistoryFile).toHaveBeenCalledWith(record);
    expect(container.textContent).toContain(copy.cards.editFromImageTitle);

    setFieldValue(getField<HTMLTextAreaElement>(container, copy.fields.editInstructions, "textarea"), "Make it night.");

    await act(async () => {
      clickModalPrimaryButton(container);
    });
    await flushAppEffects();

    expect(container.querySelector(".app-shell")?.classList.contains("tab-generate")).toBe(true);
    expect(container.textContent).toContain(copy.modes.imageToImage);
    expect(getField<HTMLTextAreaElement>(container, copy.fields.prompt, "textarea").value).toContain(
      "Create a France World Cup poster.",
    );
    expect(getField<HTMLTextAreaElement>(container, copy.fields.prompt, "textarea").value).toContain("Make it night.");
    expect(container.textContent).toContain(`${copy.cards.referenceImages}: 1/`);
  });

  it("restores a batch history preview and can edit from a restored batch image", async () => {
    const copy = getTranslations("en-US");
    const france = createHistoryRecord({
      id: "record-france",
      prompt: "Create a France poster.",
      outputPath: "outputs/2026-05-26/batch/france.png",
      batch: {
        id: "batch-world-cup",
        title: "World Cup posters",
        createdAt: "2026-05-26T00:00:00.000Z",
        taskId: "task-france",
        taskIndex: 0,
        taskTitle: "France poster",
        totalTasks: 2,
      },
    });
    const japan = createHistoryRecord({
      id: "record-japan",
      prompt: "Create a Japan poster.",
      outputPath: "outputs/2026-05-26/batch/japan.png",
      batch: {
        id: "batch-world-cup",
        title: "World Cup posters",
        createdAt: "2026-05-26T00:00:00.000Z",
        taskId: "task-japan",
        taskIndex: 1,
        taskTitle: "Japan poster",
        totalTasks: 2,
      },
    });
    const prepareHistoryPreview = vi
      .fn<RuntimeAdapter["prepareHistoryPreview"]>()
      .mockImplementation(async (record) => `blob:${record.id}`);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["image"], { type: "image/png" }),
    } as Response);
    runtimeMock.adapter = createMockRuntime(
      { uiLanguage: "en-US", hasDismissedWelcome: true },
      { history: [france, japan], prepareHistoryPreview },
    );

    await act(async () => {
      root.render(<App />);
    });
    await flushAppEffects();

    await act(async () => {
      clickButton(container, copy.actions.inspectBatch);
      await Promise.resolve();
    });
    await flushAppEffects();

    expect(prepareHistoryPreview).toHaveBeenCalledTimes(2);
    expect(container.querySelector(".preview-panel")?.textContent).toContain("World Cup posters");
    expect(container.querySelector(".preview-panel")?.textContent).toContain(copy.preview.batchGallery);
    expect(container.querySelector(".preview-panel")?.textContent).toContain("France poster");
    expect(container.querySelector(".preview-panel")?.textContent).toContain("Japan poster");

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".batch-preview-gallery .ghost-button")?.click();
      await Promise.resolve();
    });
    await flushAppEffects();

    expect(fetchSpy).toHaveBeenCalledWith("blob:record-france");
    expect(container.textContent).toContain(copy.cards.editFromImageTitle);
  });
});

function clickButton(container: HTMLElement, label: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === label,
  ) as HTMLButtonElement | undefined;

  if (!button) {
    throw new Error(`Button not found: ${label}`);
  }

  button.click();
}

function clickModalPrimaryButton(container: HTMLElement) {
  const button = container.querySelector<HTMLButtonElement>(".modal-card .primary-button");

  if (!button) {
    throw new Error("Modal primary button not found");
  }

  button.click();
}

function getField<T extends HTMLInputElement | HTMLTextAreaElement>(
  container: HTMLElement,
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

function setFieldValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(element.constructor.prototype, "value")?.set;
  act(() => {
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function getButton(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!button) throw new Error(`Button not found: ${label}`);
  return button;
}

function createProviderProfile(index: number): ProviderProfile {
  return {
    id: `provider-${index}`,
    name: `Profile ${index}`,
    baseUrl: `https://profile-${index}.example/v1`,
    apiKey: `test-key-${index}`,
    textModel: `text-model-${index}`,
    imageModel: `image-model-${index}`,
    imageResponseMode: index % 2 === 0 ? "force-base64" : "official",
    rememberApiKey: false,
  };
}

function createHistoryRecord(overrides: Partial<ImageRecord>): ImageRecord {
  return {
    id: "record",
    status: "success",
    createdAt: "2026-05-26T00:01:00.000Z",
    prompt: "Create poster.",
    optimizedPrompt: "",
    model: "gpt-image-2",
    size: "1024x1024",
    outputPath: "outputs/2026-05-26/poster.png",
    durationMs: 1000,
    ...overrides,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
