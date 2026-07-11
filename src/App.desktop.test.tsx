import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./runtime", async () => {
  const { webAdapter } = await import("./runtime/webAdapter");
  return {
    getRuntimeAdapter: async () => ({ ...webAdapter, mode: "desktop" as const }),
  };
});

import App from "./App";
import { DEFAULT_CONFIG } from "./core/config";
import { getTranslations } from "./i18n/translations";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("App desktop settings", () => {
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
    act(() => root.unmount());
    container.remove();
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("does not show the browser-only API-key retention control", async () => {
    const copy = getTranslations("en-US");

    await act(async () => root.render(<App />));
    await flushEffects();
    const settingsButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === copy.tabs.settings,
    );
    if (!settingsButton) {
      throw new Error("Settings button not found");
    }
    act(() => settingsButton.click());

    expect(container.querySelector('[data-testid="settings-remember-api-key"]')).toBeNull();
  });
});

async function flushEffects() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}
