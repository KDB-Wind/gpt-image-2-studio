import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { DEFAULT_CONFIG, type AppConfig } from "./core/config";
import type { RuntimeAdapter } from "./runtime/types";

const runtimeMock = vi.hoisted(() => ({
  adapter: null as RuntimeAdapter | null,
  saveConfig: vi.fn<(_: AppConfig) => Promise<void>>(),
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
    chooseOutputDirectory: async () => null,
    prepareHistoryPreview: async () => null,
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

  it("persists language changes and opens the fixed support QR dialog", async () => {
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

    const supportButton = container.querySelector(".support-fab") as HTMLButtonElement | null;
    expect(supportButton).not.toBeNull();

    await act(async () => {
      supportButton?.click();
    });

    const supportQr = container.querySelector(".support-qr") as HTMLImageElement | null;
    expect(supportQr).not.toBeNull();
    expect(supportQr?.getAttribute("src")).toBeTruthy();

    await act(async () => {
      supportQr?.click();
    });

    expect(container.querySelector(".zoom-image")).not.toBeNull();
  });
});
