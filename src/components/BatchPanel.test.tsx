import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_CONFIG } from "../core/config";
import { splitPromptWithTextModel } from "../core/batchPromptSplitter";
import { getTranslations } from "../i18n/translations";
import { BatchPanel } from "./BatchPanel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../core/batchPromptSplitter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../core/batchPromptSplitter")>();
  return {
    ...actual,
    splitPromptWithTextModel: vi.fn(),
  };
});

const splitPromptWithTextModelMock = vi.mocked(splitPromptWithTextModel);

describe("BatchPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    splitPromptWithTextModelMock.mockResolvedValue([
      { title: "France poster", prompt: "Create a France World Cup poster in French." },
      { title: "Japan poster", prompt: "Create a Japan World Cup poster in Japanese." },
      { title: "Belgium poster", prompt: "Create a Belgium World Cup poster in Dutch and French." },
      { title: "Korea poster", prompt: "Create a Korea World Cup poster in Korean." },
    ]);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  it("uses the text model split as the only task-list action in AI split mode", async () => {
    const copy = getTranslations("en-US");
    const requireValidConfig = vi.fn().mockReturnValue(true);

    await act(async () => {
      root.render(
        <BatchPanel
          config={{ ...DEFAULT_CONFIG, apiKey: "test-key" }}
          runtime={null}
          language="en-US"
          referenceImages={[]}
          onConfigChange={vi.fn()}
          onHistoryChanged={vi.fn().mockResolvedValue(undefined)}
          requireValidConfig={requireValidConfig}
          setAppMessage={vi.fn()}
        />,
      );
    });

    clickButton(copy.batch.sources.aiSplit);
    setFieldValue(container.querySelector("textarea"), "Create posters for France / Japan / Belgium / Korea.");
    setFieldValue(container.querySelector('input[type="number"]'), "4");

    expect(queryButton(copy.batch.actions.createTasks)).toBeNull();

    await act(async () => {
      clickButton(copy.batch.actions.splitWithAi);
    });

    expect(requireValidConfig).toHaveBeenCalledWith(copy.batch.actions.splitWithAi);
    expect(splitPromptWithTextModelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        count: 4,
        masterPrompt: "Create posters for France / Japan / Belgium / Korea.",
      }),
    );
    const inputValues = Array.from(container.querySelectorAll("input")).map((input) => input.value);
    const textareaValues = Array.from(container.querySelectorAll("textarea")).map((textarea) => textarea.value);

    expect(inputValues).toContain("France poster");
    expect(inputValues).toContain("Japan poster");
    expect(textareaValues).toContain("Create a France World Cup poster in French.");
    expect(textareaValues).toContain("Create a Japan World Cup poster in Japanese.");
  });

  it("clears the current batch draft only when the user clicks clear", async () => {
    const copy = getTranslations("en-US");

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
          setAppMessage={vi.fn()}
        />,
      );
    });

    setFieldValue(getField(copy.batch.fields.batchTitle, "input"), "World Cup batch");
    setFieldValue(container.querySelector("textarea"), "Create a France poster.");
    setFieldValue(container.querySelector('input[type="number"]'), "4");
    clickButton(copy.batch.actions.createTasks);

    expect(getField(copy.batch.fields.batchTitle, "input").value).toBe("World Cup batch");
    expect(container.textContent).toContain(copy.batch.status.pending);

    clickButton(copy.batch.actions.clearDraft);

    expect(getField(copy.batch.fields.batchTitle, "input").value).toBe("");
    expect(container.querySelector("textarea")?.value).toBe("");
    expect(getField(copy.batch.fields.taskCount, 'input[type="number"]').value).toBe("10");
    expect(container.textContent).toContain(copy.batch.emptyTasks);
  });

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
