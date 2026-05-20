import { clampBatchTaskCount } from "./batchTypes";
import type { BatchSplitResultItem, BatchTask } from "./batchTypes";

export function createTasksFromRepeatedPrompt(prompt: string, count: number): BatchTask[] {
  const normalizedPrompt = prompt.trim();
  const safeCount = clampTaskCount(count);
  return Array.from({ length: safeCount }, (_, index) =>
    createDraftTask(index, `${summarizeTitle(normalizedPrompt)} ${index + 1}`, normalizedPrompt),
  );
}

export function createTasksFromMultilinePrompts(value: string): BatchTask[] {
  return createTasksFromPromptList(value.split(/\r?\n/));
}

export function createTasksFromPromptList(prompts: string[]): BatchTask[] {
  return prompts
    .map((prompt) => prompt.trim())
    .filter(Boolean)
    .slice(0, clampBatchTaskCount(prompts.length))
    .map((prompt, index) => createDraftTask(index, summarizeTitle(prompt), prompt));
}

export function createTasksFromSplitResults(items: BatchSplitResultItem[]): BatchTask[] {
  return items
    .filter((item) => item.prompt.trim())
    .map((item, index) => createDraftTask(index, item.title.trim() || summarizeTitle(item.prompt), item.prompt.trim()));
}

export function renumberBatchTasks(tasks: BatchTask[]): BatchTask[] {
  return tasks.map((task, index) => ({ ...task, index, id: `task-${String(index + 1).padStart(3, "0")}` }));
}

function createDraftTask(index: number, title: string, prompt: string): BatchTask {
  return {
    id: `task-${String(index + 1).padStart(3, "0")}`,
    index,
    title,
    prompt,
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
