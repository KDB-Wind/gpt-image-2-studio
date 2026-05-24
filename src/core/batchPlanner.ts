import { clampBatchTaskCount } from "./batchTypes";
import type { BatchSplitResultItem, BatchTask } from "./batchTypes";
import { appendStyleLockToPrompt } from "./batchWorkflow";

export type BatchTaskCreationOptions = {
  styleLock?: string;
};

export function createTasksFromRepeatedPrompt(
  prompt: string,
  count: number,
  options: BatchTaskCreationOptions = {},
): BatchTask[] {
  const normalizedPrompt = prompt.trim();
  const taskPrompt = appendStyleLockToPrompt(normalizedPrompt, options.styleLock ?? "");
  const safeCount = clampTaskCount(count);
  return Array.from({ length: safeCount }, (_, index) =>
    createDraftTask(index, `${summarizeTitle(normalizedPrompt)} ${index + 1}`, taskPrompt),
  );
}

export function createTasksFromMultilinePrompts(value: string, options: BatchTaskCreationOptions = {}): BatchTask[] {
  return createTasksFromPromptList(value.split(/\r?\n/), options);
}

export function createTasksFromPromptList(prompts: string[], options: BatchTaskCreationOptions = {}): BatchTask[] {
  return prompts
    .map((prompt) => prompt.trim())
    .filter(Boolean)
    .slice(0, clampBatchTaskCount(prompts.length))
    .map((prompt, index) => createDraftTask(index, summarizeTitle(prompt), appendStyleLockToPrompt(prompt, options.styleLock ?? "")));
}

export function createTasksFromSplitResults(
  items: BatchSplitResultItem[],
  options: BatchTaskCreationOptions = {},
): BatchTask[] {
  return items
    .filter((item) => item.prompt.trim())
    .map((item, index) =>
      createDraftTask(index, item.title.trim() || summarizeTitle(item.prompt), appendStyleLockToPrompt(item.prompt, options.styleLock ?? ""), {
        suggestedName: item.suggestedName?.trim() || undefined,
        plannerNotes: item.notes?.trim() || undefined,
      }),
    );
}

export function renumberBatchTasks(tasks: BatchTask[]): BatchTask[] {
  return tasks.map((task, index) => ({ ...task, index, id: `task-${String(index + 1).padStart(3, "0")}` }));
}

function createDraftTask(
  index: number,
  title: string,
  prompt: string,
  metadata: Pick<BatchTask, "suggestedName" | "plannerNotes"> = {},
): BatchTask {
  return {
    id: `task-${String(index + 1).padStart(3, "0")}`,
    index,
    title,
    prompt,
    ...metadata,
    status: "pending",
    attemptCount: 0,
    errorMessage: "",
    failureCategory: null,
    outputPath: "",
    previewUrl: "",
    durationMs: 0,
    startedAt: "",
    completedAt: "",
  };
}

function summarizeTitle(value: string): string {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .slice(0, 6)
    .join(" ") || "image";
}

function clampTaskCount(count: number): number {
  return clampBatchTaskCount(count);
}
