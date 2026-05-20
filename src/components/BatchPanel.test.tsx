import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_CONFIG } from "../core/config";
import { getTranslations } from "../i18n/translations";
import { BatchPanel } from "./BatchPanel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("BatchPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  it("creates editable prompt boxes for custom prompts and builds one task per filled prompt", async () => {
    const copy = getTranslations("en-US");

    await act(async () => {
      root.render(
        <BatchPanel
          config={{ ...DEFAULT_CONFIG, apiKey: "test-key", batchDefaultTaskCount: 5 }}
          runtime={null}
          language="en-US"
          referenceImages={[]}
          onConfigChange={vi.fn()}
          onHistoryChanged={vi.fn().mockResolvedValue(undefined)}
          requireValidConfig={vi.fn().mockReturnValue(true)}
          setAppMessage={vi.fn()}
        />,
      );
    });

    clickButton(copy.batch.sources.customPrompts);

    const draftPrompts = getDraftPromptTextareas();
    expect(draftPrompts).toHaveLength(5);

    setFieldValue(draftPrompts[0], "Create a France World Cup poster in French.");
    setFieldValue(draftPrompts[1], "Create a Japan World Cup poster in Japanese.");
    clickButton(copy.batch.actions.createTasks);

    const textareaValues = Array.from(container.querySelectorAll("textarea")).map((textarea) => textarea.value);

    expect(textareaValues).toContain("Create a France World Cup poster in French.");
    expect(textareaValues).toContain("Create a Japan World Cup poster in Japanese.");
    expect(container.textContent).toContain(copy.batch.status.pending);
    expect(container.textContent).not.toContain("Split with text model");
    expect(container.textContent).not.toContain("AI split");
  });

  it("syncs custom prompt box count with the configurable default task count", async () => {
    const copy = getTranslations("en-US");
    const onConfigChange = vi.fn();
    const setAppMessage = vi.fn();

    await act(async () => {
      root.render(
        <BatchPanel
          config={{ ...DEFAULT_CONFIG, apiKey: "test-key", batchDefaultTaskCount: 5 }}
          runtime={null}
          language="en-US"
          referenceImages={[]}
          onConfigChange={onConfigChange}
          onHistoryChanged={vi.fn().mockResolvedValue(undefined)}
          requireValidConfig={vi.fn().mockReturnValue(true)}
          setAppMessage={setAppMessage}
        />,
      );
    });

    clickButton(copy.batch.sources.customPrompts);
    setFieldValue(getField(copy.batch.fields.taskCount, 'input[type="number"]'), "3");

    expect(getDraftPromptTextareas()).toHaveLength(3);
    expect(onConfigChange).toHaveBeenCalledWith("batchDefaultTaskCount", 3);

    setFieldValue(getField(copy.batch.fields.taskCount, 'input[type="number"]'), "21");

    expect(getDraftPromptTextareas()).toHaveLength(20);
    expect(setAppMessage).toHaveBeenCalledWith(copy.batch.messages.maxTaskCountWarning(20));
  });

  it("lets the batch concurrency field keep a value of five", async () => {
    const copy = getTranslations("en-US");
    const onConfigChange = vi.fn();

    await act(async () => {
      root.render(
        <BatchPanel
          config={{ ...DEFAULT_CONFIG, apiKey: "test-key", batchDefaultConcurrency: 5 }}
          runtime={null}
          language="en-US"
          referenceImages={[]}
          onConfigChange={onConfigChange}
          onHistoryChanged={vi.fn().mockResolvedValue(undefined)}
          requireValidConfig={vi.fn().mockReturnValue(true)}
          setAppMessage={vi.fn()}
        />,
      );
    });

    const concurrencyInput = getField(copy.batch.fields.concurrency, 'input[type="number"]');
    if (!(concurrencyInput instanceof HTMLInputElement)) {
      throw new Error("Concurrency input not found.");
    }
    expect(concurrencyInput.value).toBe("5");
    expect(concurrencyInput.max).toBe("10");

    setFieldValue(concurrencyInput, "6");

    expect(onConfigChange).toHaveBeenCalledWith("batchDefaultConcurrency", 6);
  });

  it("clears the current batch draft only when the user clicks clear", async () => {
    const copy = getTranslations("en-US");
    const setAppMessage = vi.fn();

    await act(async () => {
      root.render(
        <BatchPanel
          config={{ ...DEFAULT_CONFIG, apiKey: "test-key" }}
          runtime={null}
          language="en-US"
          referenceImages={[]}
          onConfigChange={vi.fn()}
          onHistoryChanged={vi.fn().mockResolvedValue(undefined)}
          requireValidConfig={vi.fn().mockReturnValue(true)}
          setAppMessage={setAppMessage}
        />,
      );
    });

    setFieldValue(getField(copy.batch.fields.batchTitle, "input"), "World Cup batch");
    setFieldValue(container.querySelector("textarea"), "Create a France poster.");
    setFieldValue(container.querySelector('input[type="number"]'), "4");
    clickButton(copy.batch.actions.createTasks);

    expect(getField(copy.batch.fields.batchTitle, "input").value).toBe("World Cup batch");
    expect(container.textContent).toContain(copy.batch.status.pending);
    expect(setAppMessage).toHaveBeenCalledWith("");
    setAppMessage.mockClear();

    clickButton(copy.batch.actions.clearDraft);

    expect(getField(copy.batch.fields.batchTitle, "input").value).toBe("");
    expect(container.querySelector("textarea")?.value).toBe("");
    expect(getField(copy.batch.fields.taskCount, 'input[type="number"]').value).toBe("5");
    expect(container.textContent).toContain(copy.batch.emptyTasks);
    expect(setAppMessage).toHaveBeenCalledWith("");
  });

  function getDraftPromptTextareas(): HTMLTextAreaElement[] {
    return Array.from(container.querySelectorAll(".custom-prompt-draft textarea"));
  }

  function clickButton(label: string) {
    const button = queryButton(label);
    if (!button) {
      throw new Error(`Button not found: ${label}`);
    }

    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

  function queryButton(label: string): HTMLButtonElement | null {
    return (
      Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes(label)) ?? null
    );
  }

  function getField(labelText: string, selector: string): HTMLInputElement | HTMLTextAreaElement {
    const label = Array.from(container.querySelectorAll("label.field")).find(
      (candidate) => candidate.querySelector("span")?.textContent === labelText,
    );
    const field = label?.querySelector(selector);

    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) {
      throw new Error(`Field not found: ${labelText}`);
    }

    return field;
  }
});

function setFieldValue(element: HTMLInputElement | HTMLTextAreaElement | null, value: string) {
  if (!element) {
    throw new Error("Input field not found.");
  }

  const setter = Object.getOwnPropertyDescriptor(element.constructor.prototype, "value")?.set;
  act(() => {
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
