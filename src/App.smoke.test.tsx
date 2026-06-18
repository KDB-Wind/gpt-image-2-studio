import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { DEFAULT_CONFIG, type AppConfig } from "./core/config";
import { getTranslations } from "./i18n/translations";
import type { RuntimeAdapter } from "./runtime/types";

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

function createMockRuntime(config: Partial<AppConfig> = {}): RuntimeAdapter {
  const mergedConfig = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  return {
    mode: "web",
    loadConfig: async () => mergedConfig,
    saveConfig: runtimeMock.saveConfig,
    loadHistory: async () => [],
    deleteHistoryRecords: async () => [],
    saveImage: async () => {
      throw new Error("saveImage is not used in smoke tests.");
    },
    saveBatchImage: async () => {
      throw new Error("saveBatchImage is not used in smoke tests.");
    },
    saveBatchManifest: async () => "manifest.json",
    chooseOutputDirectory: runtimeMock.chooseOutputDirectory,
    prepareHistoryPreview: async () => null,
    prepareHistoryFile: async () => null,
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
    expect(container.querySelector(".modal-card.wide")).not.toBeNull();
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
    expect(statusBefore?.textContent).toContain("Images may fall back to browser downloads until the folder test passes.");

    await act(async () => {
      clickButton(container, copy.actions.chooseDirectory);
      await Promise.resolve();
    });
    await flushAppEffects();

    const statusAfter = container.querySelector(".output-directory-status");
    expect(statusAfter?.textContent).toContain("Recorded folder: gpt-image-2-studio.");
    expect(statusAfter?.textContent).toContain("Use Test output folder to confirm this browser can write and restore previews.");
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
