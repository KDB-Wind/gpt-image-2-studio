import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import App from "./App";
import { DEFAULT_CONFIG } from "./core/config";
import { getTranslations } from "./i18n/translations";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("App batch workspace", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.localStorage.clear();
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

  function getField<T extends HTMLInputElement | HTMLTextAreaElement>(labelText: string, selector: string): T {
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
