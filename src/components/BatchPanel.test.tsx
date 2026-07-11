import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_CONFIG } from "../core/config";
import { getTranslations } from "../i18n/translations";
import type { RuntimeAdapter } from "../runtime/types";
import { BatchPanel } from "./BatchPanel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const splitPromptWithTextModelMock = vi.hoisted(() => vi.fn());
const runBatchTasksMock = vi.hoisted(() => vi.fn());
const retrySingleBatchTaskMock = vi.hoisted(() => vi.fn());

vi.mock("../core/batchPromptSplitter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../core/batchPromptSplitter")>();
  return {
    ...actual,
    splitPromptWithTextModel: splitPromptWithTextModelMock,
  };
});

vi.mock("../core/batchRunner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../core/batchRunner")>();
  return {
    ...actual,
    runBatchTasks: runBatchTasksMock,
    retrySingleBatchTask: retrySingleBatchTaskMock,
  };
});

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
    expect(queryButton(copy.batch.actions.splitWithTextModel)).toBeNull();
  });

  it("shows save counts and a redacted fallback reason after batch completion", async () => {
    const copy = getTranslations("en-US");
    const runtime = createRuntime();
    const tasks = [
      createTestTask({
        id: "task-1",
        title: "Red robot",
        saveMode: "authorized-directory",
      }),
      createTestTask({
        id: "task-2",
        title: "Green rocket",
        saveMode: "browser-download",
        saveFallbackReason: "Write failed at [redacted-url].",
      }),
    ];
    runBatchTasksMock.mockResolvedValue({ status: "completed", tasks, pauseReason: null });

    await act(async () => {
      root.render(
        <BatchPanel
          config={{ ...DEFAULT_CONFIG, apiKey: "test-key", batchDefaultTaskCount: 2 }}
          runtime={runtime}
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
    const prompts = getDraftPromptTextareas();
    setFieldValue(prompts[0], "Create a red robot icon");
    setFieldValue(prompts[1], "Create a green rocket icon");
    clickButton(copy.batch.actions.createTasks);

    await act(async () => {
      clickButton(copy.batch.actions.start);
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="batch-save-summary"]')?.textContent).toContain("saved to authorized directory 1");
    expect(container.querySelector('[data-testid="batch-save-summary"]')?.textContent).toContain("fell back to browser download 1");
    expect(container.querySelector('[data-testid="batch-save-fallback-task-task-2"]')?.textContent).toContain("[redacted-url]");
  });

  it("keeps batch reference image tools collapsed by default", async () => {
    const copy = getTranslations("en-US");

    await act(async () => {
      root.render(
        <BatchPanel
          config={{ ...DEFAULT_CONFIG, batchDefaultTaskCount: 1 }}
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

    const referenceDetails = container.querySelector<HTMLDetailsElement>("details.batch-reference-section");
    expect(referenceDetails).not.toBeNull();
    expect(referenceDetails?.open).toBe(false);
    expect(referenceDetails?.querySelector("summary")?.textContent).toContain("Batch reference images (image-to-image)");
  });

  it("adds batch-only reference images and sends them with every batch task", async () => {
    const copy = getTranslations("en-US");
    const runtime = createRuntime();
    const referenceA = new File(["image-a"], "team-kit.png", { type: "image/png" });
    const referenceB = new File(["image-b"], "poster-layout.webp", { type: "image/webp" });
    runBatchTasksMock.mockResolvedValue({ status: "completed", tasks: [], pauseReason: null });

    await act(async () => {
      root.render(
        <BatchPanel
          config={{ ...DEFAULT_CONFIG, apiKey: "test-key", batchDefaultTaskCount: 1 }}
          runtime={runtime}
          language="en-US"
          referenceImages={[]}
          onConfigChange={vi.fn()}
          onHistoryChanged={vi.fn().mockResolvedValue(undefined)}
          requireValidConfig={vi.fn().mockReturnValue(true)}
          setAppMessage={vi.fn()}
        />,
      );
    });

    const fileInput = Array.from(container.querySelectorAll<HTMLInputElement>("input")).find(
      (input) => input.ariaLabel === copy.batch.referenceImages.title,
    );
    if (!fileInput) {
      throw new Error("Batch reference image input not found.");
    }

    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        configurable: true,
        value: [referenceA, referenceB],
      });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.textContent).toContain("team-kit.png");
    expect(container.textContent).toContain("poster-layout.webp");
    expect(container.textContent).toContain("Batch references: 2/8");

    setFieldValue(getField(copy.batch.fields.masterPrompt, "textarea"), "Create one campaign poster.");
    clickButton(copy.batch.actions.createTasks);
    await clickButtonAsync(copy.batch.actions.start);

    expect(runBatchTasksMock).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceImages: [referenceA, referenceB],
      }),
    );
  });

  it("keeps per-task reference tools collapsed by default and can expand or collapse all", async () => {
    const copy = getTranslations("en-US");

    await act(async () => {
      root.render(
        <BatchPanel
          config={{ ...DEFAULT_CONFIG, apiKey: "test-key", batchDefaultTaskCount: 2 }}
          runtime={createRuntime()}
          language="en-US"
          referenceImages={[]}
          onConfigChange={vi.fn()}
          onHistoryChanged={vi.fn().mockResolvedValue(undefined)}
          requireValidConfig={vi.fn().mockReturnValue(true)}
          setAppMessage={vi.fn()}
        />,
      );
    });

    setFieldValue(getField(copy.batch.fields.masterPrompt, "textarea"), "Create two campaign posters.");
    clickButton(copy.batch.actions.createTasks);

    const taskReferenceDetails = Array.from(
      container.querySelectorAll<HTMLDetailsElement>("details.task-reference-section"),
    );
    expect(taskReferenceDetails).toHaveLength(2);
    expect(taskReferenceDetails.every((details) => details.open === false)).toBe(true);
    expect(container.textContent).toContain(copy.batch.referenceImages.taskTitle);

    clickButton(copy.batch.referenceImages.expandAllTaskReferences);
    expect(taskReferenceDetails.every((details) => details.open === true)).toBe(true);
    expect(getFileInputByLabel(copy.batch.referenceImages.taskInputLabel(1))).not.toBeNull();

    clickButton(copy.batch.referenceImages.collapseAllTaskReferences);
    expect(taskReferenceDetails.every((details) => details.open === false)).toBe(true);
  });

  it("sends global and per-task reference images, and lets a task opt out of global references", async () => {
    const copy = getTranslations("en-US");
    const runtime = createRuntime();
    const globalReference = new File(["global"], "global-style.png", { type: "image/png" });
    const taskReference = new File(["task"], "task-one-face.png", { type: "image/png" });
    runBatchTasksMock.mockResolvedValue({ status: "completed", tasks: [], pauseReason: null });

    await act(async () => {
      root.render(
        <BatchPanel
          config={{ ...DEFAULT_CONFIG, apiKey: "test-key", batchDefaultTaskCount: 2 }}
          runtime={runtime}
          language="en-US"
          referenceImages={[]}
          onConfigChange={vi.fn()}
          onHistoryChanged={vi.fn().mockResolvedValue(undefined)}
          requireValidConfig={vi.fn().mockReturnValue(true)}
          setAppMessage={vi.fn()}
        />,
      );
    });

    await uploadFile(copy.batch.referenceImages.title, [globalReference]);
    setFieldValue(getField(copy.batch.fields.masterPrompt, "textarea"), "Create two campaign posters.");
    clickButton(copy.batch.actions.createTasks);
    clickButton(copy.batch.referenceImages.expandAllTaskReferences);
    await uploadFile(copy.batch.referenceImages.taskInputLabel(1), [taskReference]);

    expect(container.textContent).toContain("task-one-face.png");
    expect(container.textContent).toContain(copy.batch.referenceImages.usesGlobalHint);

    const firstUseGlobalCheckbox = container.querySelector<HTMLInputElement>(
      `input[aria-label="${copy.batch.referenceImages.useGlobalForTask(1)}"]`,
    );
    if (!firstUseGlobalCheckbox) {
      throw new Error("Per-task global reference checkbox not found.");
    }

    await act(async () => {
      firstUseGlobalCheckbox.click();
    });

    await clickButtonAsync(copy.batch.actions.start);
    const runInput = runBatchTasksMock.mock.calls[0][0];

    expect(runInput.getTaskReferenceImages(runInput.tasks[0])).toEqual([taskReference]);
    expect(runInput.getTaskReferenceImages(runInput.tasks[1])).toEqual([globalReference]);
  });

  it("splits the same prompt with the text model and fills editable tasks", async () => {
    const copy = getTranslations("en-US");
    const requireValidConfig = vi.fn().mockReturnValue(true);
    const setAppMessage = vi.fn();
    splitPromptWithTextModelMock.mockResolvedValue({
      items: [
        {
          title: "France poster",
          prompt: "Create a France World Cup poster in French.",
          suggestedName: "france-world-cup-poster",
          notes: "Uses French language and national-team colors.",
        },
        {
          title: "Japan poster",
          prompt: "Create a Japan World Cup poster in Japanese.",
          suggestedName: "japan-world-cup-poster",
          notes: "Uses Japanese language and red-white visual identity.",
        },
      ],
    });

    await act(async () => {
      root.render(
        <BatchPanel
          config={{ ...DEFAULT_CONFIG, apiKey: "test-key", batchDefaultTaskCount: 2 }}
          runtime={null}
          language="en-US"
          referenceImages={[]}
          onConfigChange={vi.fn()}
          onHistoryChanged={vi.fn().mockResolvedValue(undefined)}
          requireValidConfig={requireValidConfig}
          setAppMessage={setAppMessage}
        />,
      );
    });

    setFieldValue(getField(copy.batch.fields.masterPrompt, "textarea"), "Create France and Japan World Cup posters.");
    await clickButtonAsync(copy.batch.actions.splitWithTextModel);

    expect(requireValidConfig).toHaveBeenCalledWith(copy.batch.actions.splitWithTextModel);
    expect(splitPromptWithTextModelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ apiKey: "test-key" }),
        masterPrompt: "Create France and Japan World Cup posters.",
        count: 2,
        templateId: "basic",
        customSystemPrompt: "",
        styleLock: "",
        allowAiTaskCountPlanning: true,
      }),
    );

    const textareaValues = Array.from(container.querySelectorAll("textarea")).map((textarea) => textarea.value);
    const inputValues = Array.from(container.querySelectorAll("input")).map((input) => input.value);
    expect(textareaValues).toContain("Create a France World Cup poster in French.");
    expect(textareaValues).toContain("Create a Japan World Cup poster in Japanese.");
    expect(inputValues).toContain("France poster");
    expect(inputValues).toContain("Japan poster");
    expect(container.textContent).toContain("Uses French language and national-team colors.");
    expect(container.textContent).toContain(copy.batch.fields.plannerNotes);
    expect(setAppMessage).toHaveBeenLastCalledWith(copy.batch.messages.splitSuccess(2));
  });

  it("applies the batch style lock when creating repeated prompt tasks", async () => {
    const copy = getTranslations("en-US");

    await act(async () => {
      root.render(
        <BatchPanel
          config={{ ...DEFAULT_CONFIG, apiKey: "test-key", batchDefaultTaskCount: 2 }}
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

    setFieldValue(getField(copy.batch.fields.masterPrompt, "textarea"), "Create a football poster.");
    setFieldValue(getField("Batch style lock", "textarea"), "same lens, warm daylight, cream background");
    clickButton(copy.batch.actions.createTasks);

    const textareaValues = Array.from(container.querySelectorAll("textarea")).map((textarea) => textarea.value);
    expect(textareaValues).toContain(
      "Create a football poster.\n\nBatch style lock: same lens, warm daylight, cream background",
    );
  });

  it("passes the batch style lock into AI task planning", async () => {
    const copy = getTranslations("en-US");
    splitPromptWithTextModelMock.mockResolvedValue({ items: [{ title: "France", prompt: "Create a France poster." }] });

    await act(async () => {
      root.render(
        <BatchPanel
          config={{ ...DEFAULT_CONFIG, apiKey: "test-key", batchDefaultTaskCount: 1 }}
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

    setFieldValue(getField(copy.batch.fields.masterPrompt, "textarea"), "Create France and Japan posters.");
    setFieldValue(getField("Batch style lock", "textarea"), "consistent magazine cover layout");
    await clickButtonAsync(copy.batch.actions.splitWithTextModel);

    expect(splitPromptWithTextModelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        styleLock: "consistent magazine cover layout",
        allowAiTaskCountPlanning: true,
      }),
    );
  });

  it("lets the text model adjust the task count when AI count planning is enabled", async () => {
    const copy = getTranslations("en-US");
    const setAppMessage = vi.fn();
    const onConfigChange = vi.fn();
    splitPromptWithTextModelMock.mockResolvedValue({
      recommendedCount: 4,
      countReason: "The master task asks for four country posters.",
      items: [
        { title: "France", prompt: "Create a France poster." },
        { title: "Japan", prompt: "Create a Japan poster." },
        { title: "Belgium", prompt: "Create a Belgium poster." },
        { title: "Korea", prompt: "Create a Korea poster." },
      ],
    });

    await act(async () => {
      root.render(
        <BatchPanel
          config={{ ...DEFAULT_CONFIG, apiKey: "test-key", batchDefaultTaskCount: 3 }}
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

    setFieldValue(
      getField(copy.batch.fields.masterPrompt, "textarea"),
      "Create France / Japan / Belgium / Korea 2026 World Cup posters, use each country's native language.",
    );
    await clickButtonAsync(copy.batch.actions.splitWithTextModel);

    expect(splitPromptWithTextModelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        count: 3,
        allowAiTaskCountPlanning: true,
      }),
    );
    expect(getField(copy.batch.fields.taskCount, 'input[type="number"]').value).toBe("4");
    expect(onConfigChange).toHaveBeenCalledWith("batchDefaultTaskCount", 4);
    expect(setAppMessage).toHaveBeenLastCalledWith(
      expect.stringContaining("AI recommended 4 tasks and adjusted the task count to 4"),
    );
  });

  it("uses every returned item when AI count planning is enabled without a recommended count", async () => {
    const copy = getTranslations("en-US");
    const onConfigChange = vi.fn();
    splitPromptWithTextModelMock.mockResolvedValue({
      items: Array.from({ length: 4 }, (_, index) => ({
        title: `Task ${index + 1}`,
        prompt: `Create image ${index + 1}.`,
      })),
    });

    await act(async () => {
      root.render(
        <BatchPanel
          config={{ ...DEFAULT_CONFIG, apiKey: "test-key", batchDefaultTaskCount: 3 }}
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

    setFieldValue(getField(copy.batch.fields.masterPrompt, "textarea"), "Create four named poster variants.");
    await clickButtonAsync(copy.batch.actions.splitWithTextModel);

    expect(getField(copy.batch.fields.taskCount, 'input[type="number"]').value).toBe("4");
    expect(container.querySelectorAll(".batch-task-card")).toHaveLength(4);
    expect(onConfigChange).toHaveBeenCalledWith("batchDefaultTaskCount", 4);
  });

  it("rejects inconsistent AI count metadata without replacing the current task list", async () => {
    const copy = getTranslations("en-US");
    const setAppMessage = vi.fn();
    splitPromptWithTextModelMock.mockResolvedValue({
      recommendedCount: 4,
      items: Array.from({ length: 3 }, (_, index) => ({
        title: `Replacement ${index + 1}`,
        prompt: `Replacement prompt ${index + 1}.`,
      })),
    });

    await act(async () => {
      root.render(
        <BatchPanel
          config={{ ...DEFAULT_CONFIG, apiKey: "test-key", batchDefaultTaskCount: 1 }}
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

    setFieldValue(getField(copy.batch.fields.masterPrompt, "textarea"), "Keep this existing task.");
    clickButton(copy.batch.actions.createTasks);
    await clickButtonAsync(copy.batch.actions.splitWithTextModel);

    expect(container.querySelectorAll(".batch-task-card")).toHaveLength(1);
    expect(getTaskPromptTextareas()[0].value).toContain("Keep this existing task.");
    expect(setAppMessage).toHaveBeenLastCalledWith(copy.batch.messages.aiCountMismatch(4, 3));
  });

  it("rejects a mismatched result when AI count planning is disabled", async () => {
    const copy = getTranslations("en-US");
    const setAppMessage = vi.fn();
    splitPromptWithTextModelMock.mockResolvedValue({
      recommendedCount: 8,
      countReason: "The master task asks for eight variants.",
      items: Array.from({ length: 8 }, (_, index) => ({
        title: `Task ${index + 1}`,
        prompt: `Create image ${index + 1}.`,
      })),
    });

    await act(async () => {
      root.render(
        <BatchPanel
          config={{ ...DEFAULT_CONFIG, apiKey: "test-key", batchDefaultTaskCount: 5, batchAutoPlanTaskCount: false }}
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

    setFieldValue(
      getField(copy.batch.fields.masterPrompt, "textarea"),
      "Create eight different football poster styles.",
    );
    await clickButtonAsync(copy.batch.actions.splitWithTextModel);

    expect(splitPromptWithTextModelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        count: 5,
        allowAiTaskCountPlanning: false,
      }),
    );
    expect(getField(copy.batch.fields.taskCount, 'input[type="number"]').value).toBe("5");
    expect(Array.from(container.querySelectorAll(".batch-task-card"))).toHaveLength(0);
    expect(setAppMessage).toHaveBeenLastCalledWith(copy.batch.messages.fixedAiCountMismatch(5, 8));
  });

  it("keeps an over-limit AI plan unchanged when the user cancels confirmation", async () => {
    const copy = getTranslations("en-US");
    const setAppMessage = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    splitPromptWithTextModelMock.mockResolvedValue({
      recommendedCount: 25,
      items: Array.from({ length: 25 }, (_, index) => ({
        title: `Replacement ${index + 1}`,
        prompt: `Replacement prompt ${index + 1}.`,
      })),
    });

    await act(async () => {
      root.render(
        <BatchPanel
          config={{ ...DEFAULT_CONFIG, apiKey: "test-key", batchDefaultTaskCount: 1 }}
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

    setFieldValue(getField(copy.batch.fields.masterPrompt, "textarea"), "Keep this existing task.");
    clickButton(copy.batch.actions.createTasks);
    await clickButtonAsync(copy.batch.actions.splitWithTextModel);

    expect(confirmSpy).toHaveBeenCalledWith(copy.batch.messages.aiCountOverLimitConfirm(25, 20));
    expect(container.querySelectorAll(".batch-task-card")).toHaveLength(1);
    expect(getTaskPromptTextareas()[0].value).toContain("Keep this existing task.");
    expect(setAppMessage).toHaveBeenLastCalledWith(copy.batch.messages.aiCountOverLimitCancelled);
    confirmSpy.mockRestore();
  });

  it("uses the first twenty AI tasks only after explicit confirmation", async () => {
    const copy = getTranslations("en-US");
    const setAppMessage = vi.fn();
    const onConfigChange = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    splitPromptWithTextModelMock.mockResolvedValue({
      recommendedCount: 25,
      items: Array.from({ length: 25 }, (_, index) => ({
        title: `Task ${index + 1}`,
        prompt: `Create image ${index + 1}.`,
      })),
    });

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

    setFieldValue(getField(copy.batch.fields.masterPrompt, "textarea"), "Create twenty-five named posters.");
    await clickButtonAsync(copy.batch.actions.splitWithTextModel);

    expect(confirmSpy).toHaveBeenCalledWith(copy.batch.messages.aiCountOverLimitConfirm(25, 20));
    expect(container.querySelectorAll(".batch-task-card")).toHaveLength(20);
    expect(getTaskNameInputs().at(-1)?.value).toBe("Task 20");
    expect(getTaskNameInputs().some((input) => input.value === "Task 21")).toBe(false);
    expect(getField(copy.batch.fields.taskCount, 'input[type="number"]').value).toBe("20");
    expect(onConfigChange).toHaveBeenCalledWith("batchDefaultTaskCount", 20);
    expect(setAppMessage).toHaveBeenLastCalledWith(copy.batch.messages.aiCountLimitedAfterConfirmation(25, 20));
    confirmSpy.mockRestore();
  });

  it("shows the AI task-count planning setting in settings-facing copy", async () => {
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

    expect(copy.batch.fields.autoPlanTaskCount).toBe("Let AI adjust task count");
    expect(copy.batch.fields.autoPlanTaskCountHint).toContain("recommendedCount");
  });

  it("keeps batch export as a collapsed advanced action instead of a primary workflow panel", async () => {
    const copy = getTranslations("en-US");

    await act(async () => {
      root.render(
        <BatchPanel
          config={{ ...DEFAULT_CONFIG, apiKey: "test-key", batchDefaultTaskCount: 1 }}
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

    setFieldValue(getField(copy.batch.fields.batchTitle, "input"), "Poster batch");
    setFieldValue(getField(copy.batch.fields.masterPrompt, "textarea"), "Create a poster.");
    setFieldValue(getField("Batch style lock", "textarea"), "consistent editorial grid");
    clickButton(copy.batch.actions.createTasks);

    expect(container.textContent).not.toContain("Prompt workflow");
    expect(container.textContent).not.toContain(copy.batch.actions.applyStyleLock);
    expect(container.textContent).toContain("Advanced export");
    clickButton("Generate export text");

    expect(container.textContent).toContain("Batch export text");
    const recipeTextarea = Array.from(container.querySelectorAll("textarea")).find((textarea) =>
      textarea.value.includes("Prompt Recipe v1"),
    );
    expect(recipeTextarea?.value).toContain("Style lock: consistent editorial grid");
  });

  it("presents text-model splitting as an AI batch task planner", async () => {
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

    expect(container.textContent).toContain("AI batch task planner");
    expect(container.textContent).toContain("titles, prompts, suggested names, and planning notes");
    expect(queryButton("Plan task list")).not.toBeNull();
  });

  it("explains when to use each text-model split rule", async () => {
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

    expect(container.textContent).toContain(copy.batch.aiSplit.guideTitle);
    expect(container.textContent).toContain("Not sure? Use this.");
    expect(container.textContent).toContain("posters, avatars, covers, or product shots");
    expect(container.textContent).toContain("exact rules the text model should follow");
  });

  it("keeps advanced batch planning and execution notes collapsed by default", async () => {
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

    const splitGuide = container.querySelector<HTMLDetailsElement>("details.batch-split-guide");
    const executionNotes = container.querySelector<HTMLDetailsElement>("details.batch-execution-notes");

    expect(splitGuide).not.toBeNull();
    expect(splitGuide?.open).toBe(false);
    expect(splitGuide?.querySelector("summary")?.textContent).toContain(copy.batch.aiSplit.guideTitle);
    expect(executionNotes).not.toBeNull();
    expect(executionNotes?.open).toBe(false);
    expect(executionNotes?.querySelector("summary")?.textContent).toContain(copy.batch.fields.executionNotes);
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
    setFieldValue(getField(copy.batch.fields.masterPrompt, "textarea"), "Create a France poster.");
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

  it("places recovery actions in the execution area instead of a separate prompt workflow panel", async () => {
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

    const executionRow = container.querySelector(".batch-execution-row");

    expect(container.textContent).not.toContain("Prompt workflow");
    expect(executionRow?.textContent).toContain(copy.batch.actions.start);
    expect(executionRow?.textContent).toContain(copy.batch.actions.retryFailed);
    expect(executionRow?.textContent).toContain(copy.batch.actions.clearDraft);
  });

  it("acquires a single-task retry synchronously and locks task-list mutations", async () => {
    const copy = getTranslations("en-US");
    const runtime = createRuntime();
    const retryDeferred = createDeferred<import("../core/batchTypes").BatchTask>();
    runBatchTasksMock.mockResolvedValue({
      status: "completed",
      tasks: createFailedTasks(),
      pauseReason: null,
    });
    retrySingleBatchTaskMock.mockReturnValue(retryDeferred.promise);

    await act(async () => {
      root.render(
        <BatchPanel
          config={{ ...DEFAULT_CONFIG, apiKey: "test-key", batchDefaultTaskCount: 2 }}
          runtime={runtime}
          language="en-US"
          referenceImages={[]}
          onConfigChange={vi.fn()}
          onHistoryChanged={vi.fn().mockResolvedValue(undefined)}
          requireValidConfig={vi.fn().mockReturnValue(true)}
          setAppMessage={vi.fn()}
        />,
      );
    });

    await createAndRunTwoTaskBatch(copy);
    const retryButton = queryButtons(copy.batch.actions.retryTask)[0];

    act(() => {
      retryButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      retryButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(retrySingleBatchTaskMock).toHaveBeenCalledTimes(1);
    expect(container.querySelector<HTMLButtonElement>('[data-testid="batch-start"]')?.disabled).toBe(true);
    expect(queryButton(copy.batch.actions.retryFailed)?.disabled).toBe(true);
    expect(queryButton(copy.batch.actions.clearDraft)?.disabled).toBe(true);
    expect(queryButtons(copy.actions.removeImage).every((button) => button.disabled)).toBe(true);
    expect(getTaskPromptTextareas().every((textarea) => textarea.disabled)).toBe(true);
    expect(queryButton(copy.batch.actions.pause)?.disabled).toBe(true);
    expect(queryButton(copy.batch.actions.cancel)?.disabled).toBe(true);

    retryDeferred.resolve(
      createTestTask({
        id: "task-001",
        index: 0,
        title: "Task one",
        prompt: "Prompt one",
        status: "succeeded",
        outputPath: "outputs/task-one.png",
      }),
    );
    await act(async () => {
      await retryDeferred.promise;
      await Promise.resolve();
    });
  });

  it("persists the final merged retry snapshot while keeping sibling task state", async () => {
    const copy = getTranslations("en-US");
    const runtime = createRuntime();
    const onHistoryChanged = vi.fn().mockResolvedValue(undefined);
    const failedTasks = createFailedTasks();
    const retryDeferred = createDeferred<import("../core/batchTypes").BatchTask>();
    const retriedTask = createTestTask({
      ...failedTasks[0],
      status: "succeeded",
      attemptCount: 2,
      errorMessage: "",
      failureCategory: null,
      outputPath: "outputs/task-one.png",
      previewUrl: "blob:task-one",
    });
    runBatchTasksMock.mockResolvedValue({ status: "completed", tasks: failedTasks, pauseReason: null });
    retrySingleBatchTaskMock.mockReturnValue(retryDeferred.promise);

    await act(async () => {
      root.render(
        <BatchPanel
          config={{ ...DEFAULT_CONFIG, apiKey: "test-key", batchDefaultTaskCount: 2 }}
          runtime={runtime}
          language="en-US"
          referenceImages={[]}
          onConfigChange={vi.fn()}
          onHistoryChanged={onHistoryChanged}
          requireValidConfig={vi.fn().mockReturnValue(true)}
          setAppMessage={vi.fn()}
        />,
      );
    });

    await createAndRunTwoTaskBatch(copy);
    const siblingPrompt = getTaskPromptTextareas()[1];
    const retryButton = queryButtons(copy.batch.actions.retryTask)[0];
    const valueSetter = Object.getOwnPropertyDescriptor(siblingPrompt.constructor.prototype, "value")?.set;
    act(() => {
      valueSetter?.call(siblingPrompt, "Prompt two edited immediately before retry");
      siblingPrompt.dispatchEvent(new Event("input", { bubbles: true }));
      retryButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    retryDeferred.resolve(retriedTask);
    await act(async () => {
      await retryDeferred.promise;
      await Promise.resolve();
    });

    const saveManifestMock = vi.mocked(runtime.saveBatchManifest);
    const finalManifest = saveManifestMock.mock.calls.at(-1)?.[0];
    expect(finalManifest?.tasks).toEqual([
      expect.objectContaining({ id: "task-001", status: "succeeded", outputPath: "outputs/task-one.png" }),
      expect.objectContaining({
        id: "task-002",
        status: "pending",
        prompt: "Prompt two edited immediately before retry",
      }),
    ]);
    expect(getTaskPromptTextareas()[1].value).toBe("Prompt two edited immediately before retry");
    expect(onHistoryChanged).toHaveBeenCalledTimes(2);
  });

  it("enables pause and cancel only for an actual running batch", async () => {
    const copy = getTranslations("en-US");
    const runDeferred = createDeferred<{
      status: "completed";
      tasks: import("../core/batchTypes").BatchTask[];
      pauseReason: null;
    }>();
    runBatchTasksMock.mockReturnValue(runDeferred.promise);

    await act(async () => {
      root.render(
        <BatchPanel
          config={{ ...DEFAULT_CONFIG, apiKey: "test-key", batchDefaultTaskCount: 1 }}
          runtime={createRuntime()}
          language="en-US"
          referenceImages={[]}
          onConfigChange={vi.fn()}
          onHistoryChanged={vi.fn().mockResolvedValue(undefined)}
          requireValidConfig={vi.fn().mockReturnValue(true)}
          setAppMessage={vi.fn()}
        />,
      );
    });

    setFieldValue(getField(copy.batch.fields.masterPrompt, "textarea"), "Create one poster.");
    clickButton(copy.batch.actions.createTasks);
    act(() => {
      queryButton(copy.batch.actions.start)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(queryButton(copy.batch.actions.pause)?.disabled).toBe(false);
    expect(queryButton(copy.batch.actions.cancel)?.disabled).toBe(false);

    runDeferred.resolve({ status: "completed", tasks: [], pauseReason: null });
    await act(async () => {
      await runDeferred.promise;
      await Promise.resolve();
    });
  });

  function getDraftPromptTextareas(): HTMLTextAreaElement[] {
    return Array.from(container.querySelectorAll(".custom-prompt-draft textarea"));
  }

  function getTaskPromptTextareas(): HTMLTextAreaElement[] {
    return Array.from(container.querySelectorAll(".batch-task-card .batch-task-prompt-textarea"));
  }

  function getTaskNameInputs(): HTMLInputElement[] {
    return Array.from(container.querySelectorAll(".batch-task-card .batch-task-name-field input"));
  }

  async function createAndRunTwoTaskBatch(copy: ReturnType<typeof getTranslations>) {
    clickButton(copy.batch.sources.customPrompts);
    const prompts = getDraftPromptTextareas();
    setFieldValue(prompts[0], "Prompt one");
    setFieldValue(prompts[1], "Prompt two");
    clickButton(copy.batch.actions.createTasks);
    await clickButtonAsync(copy.batch.actions.start);
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

  async function clickButtonAsync(label: string) {
    const button = queryButton(label);
    if (!button) {
      throw new Error(`Button not found: ${label}`);
    }

    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

  function queryButton(label: string): HTMLButtonElement | null {
    return (
      Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes(label)) ?? null
    );
  }

  function queryButtons(label: string): HTMLButtonElement[] {
    return Array.from(container.querySelectorAll("button")).filter((button) => button.textContent?.includes(label));
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

  function getFileInputByLabel(label: string): HTMLInputElement | null {
    return Array.from(container.querySelectorAll<HTMLInputElement>('input[type="file"]')).find(
      (input) => input.ariaLabel === label,
    ) ?? null;
  }

  async function uploadFile(label: string, files: File[]) {
    const fileInput = getFileInputByLabel(label);
    if (!fileInput) {
      throw new Error(`File input not found: ${label}`);
    }

    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        configurable: true,
        value: files,
      });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
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

function createRuntime(): RuntimeAdapter {
  return {
    mode: "web",
    loadConfig: vi.fn().mockResolvedValue(DEFAULT_CONFIG),
    saveConfig: vi.fn().mockResolvedValue(undefined),
    loadHistory: vi.fn().mockResolvedValue([]),
    deleteHistoryRecords: vi.fn().mockResolvedValue([]),
    saveImage: vi.fn(),
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

function createTestTask(overrides: Partial<import("../core/batchTypes").BatchTask>): import("../core/batchTypes").BatchTask {
  return {
    id: "task-1",
    index: 0,
    title: "Task 1",
    prompt: "Prompt 1",
    status: "succeeded",
    attemptCount: 1,
    errorMessage: "",
    failureCategory: null,
    outputPath: "gpt-image-2-studio/batch/task.png",
    previewUrl: "blob:task",
    durationMs: 100,
    startedAt: "2026-07-11T08:00:00.000Z",
    completedAt: "2026-07-11T08:00:01.000Z",
    ...overrides,
  };
}

function createFailedTasks(): import("../core/batchTypes").BatchTask[] {
  return [
    createTestTask({
      id: "task-001",
      index: 0,
      title: "Task one",
      prompt: "Prompt one",
      status: "failed",
      errorMessage: "Provider failed task one.",
      failureCategory: "unknown",
      outputPath: "",
      previewUrl: "",
    }),
    createTestTask({
      id: "task-002",
      index: 1,
      title: "Task two",
      prompt: "Prompt two",
      status: "failed",
      errorMessage: "Provider failed task two.",
      failureCategory: "unknown",
      outputPath: "",
      previewUrl: "",
    }),
  ];
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
