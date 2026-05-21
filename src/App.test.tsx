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
    expect(githubLink?.textContent).toContain(copy.actions.openGithubProject);
    expect(githubLink?.textContent).not.toContain("Star");
    expect(githubLink?.target).toBe("_blank");
    expect(githubLink?.rel).toContain("noreferrer");
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
