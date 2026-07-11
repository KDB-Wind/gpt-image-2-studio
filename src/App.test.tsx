import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import App from "./App";
import { DEFAULT_CONFIG, mergeConfig } from "./core/config";
import type { ImageRecord } from "./core/history";
import { getTranslations } from "./i18n/translations";

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
      container.querySelector('a[href="https://kdb-wind.github.io/gpt-image-2-studio/versions/v0.1.4/"]'),
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
