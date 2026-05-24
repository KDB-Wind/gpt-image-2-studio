import type {
  BatchExecutionConfig,
  BatchPromptRecipe,
  BatchSource,
  BatchSplitTemplateId,
  BatchTask,
  BatchWorkflowStep,
} from "./batchTypes";

export type BuildBatchPromptRecipeInput = {
  title: string;
  source: BatchSource;
  masterPrompt: string;
  styleLock: string;
  taskCount: number;
  splitTemplateId: BatchSplitTemplateId;
  customSplitSystemPrompt: string;
  executionConfig: BatchExecutionConfig;
  tasks: BatchTask[];
  generatedAt?: string;
};

export const BATCH_WORKFLOW_STEPS: BatchWorkflowStep[] = [
  { id: "draft", label: "Draft" },
  { id: "plan", label: "Plan" },
  { id: "review", label: "Review" },
  { id: "generate", label: "Generate" },
  { id: "recover", label: "Recover" },
];

export function appendStyleLockToPrompt(prompt: string, styleLock: string): string {
  const normalizedPrompt = prompt.trim();
  const normalizedStyleLock = styleLock.trim();

  if (!normalizedStyleLock) {
    return normalizedPrompt;
  }

  if (normalizedPrompt.toLocaleLowerCase().includes(normalizedStyleLock.toLocaleLowerCase())) {
    return normalizedPrompt;
  }

  return `${normalizedPrompt}\n\nBatch style lock: ${normalizedStyleLock}`;
}

export function applyStyleLockToTasks(tasks: BatchTask[], styleLock: string): BatchTask[] {
  return tasks.map((task) => {
    const nextPrompt = appendStyleLockToPrompt(task.prompt, styleLock);
    if (nextPrompt === task.prompt) {
      return task;
    }

    return {
      ...task,
      prompt: nextPrompt,
      status: task.status === "succeeded" ? task.status : "pending",
      errorMessage: task.status === "succeeded" ? task.errorMessage : "",
      failureCategory: task.status === "succeeded" ? task.failureCategory : null,
    };
  });
}

export function countRecoverableBatchTasks(tasks: BatchTask[]): number {
  return tasks.filter((task) => isRecoverableBatchTask(task)).length;
}

export function hasFailedBatchTasks(tasks: BatchTask[]): boolean {
  return tasks.some((task) => task.status === "failed");
}

export function resetFailedBatchTasks(tasks: BatchTask[]): BatchTask[] {
  return tasks.map((task) => {
    if (task.status !== "failed") {
      return task;
    }

    return {
      ...task,
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
  });
}

export function buildBatchPromptRecipe(input: BuildBatchPromptRecipeInput): BatchPromptRecipe {
  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    title: input.title.trim() || "Untitled batch",
    source: input.source,
    masterPrompt: input.masterPrompt.trim(),
    styleLock: input.styleLock.trim(),
    taskCount: input.taskCount,
    splitTemplateId: input.splitTemplateId,
    customSplitSystemPrompt: input.customSplitSystemPrompt.trim(),
    executionConfig: input.executionConfig,
    workflowSteps: BATCH_WORKFLOW_STEPS,
    tasks: input.tasks.map((task) => ({
      title: task.title,
      prompt: task.prompt,
      suggestedName: task.suggestedName,
    })),
  };
}

export function formatBatchPromptRecipe(recipe: BatchPromptRecipe): string {
  const lines = [
    `Prompt Recipe v${recipe.schemaVersion}`,
    `Title: ${recipe.title}`,
    `Source: ${recipe.source}`,
    `Task count: ${recipe.taskCount}`,
    `Split rule: ${recipe.splitTemplateId}`,
    `Style lock: ${recipe.styleLock || "none"}`,
    `Concurrency: ${recipe.executionConfig.concurrency}`,
    `Interval seconds: ${recipe.executionConfig.intervalSeconds}`,
    `Max retries: ${recipe.executionConfig.maxRetries}`,
    "",
    "Master task:",
    recipe.masterPrompt || "none",
    "",
    "Tasks:",
    ...recipe.tasks.flatMap((task, index) => [
      `${index + 1}. ${task.title || `Task ${index + 1}`}`,
      `Prompt: ${task.prompt}`,
      task.suggestedName ? `Suggested name: ${task.suggestedName}` : "",
    ]),
  ];

  return lines.filter((line, index) => line !== "" || lines[index - 1] !== "").join("\n");
}

function isRecoverableBatchTask(task: BatchTask): boolean {
  return task.status === "pending" || task.status === "failed";
}
