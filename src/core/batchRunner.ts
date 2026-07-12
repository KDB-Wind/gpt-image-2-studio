import { generateImages as defaultGenerateImages } from "./apiClient";
import type { AppConfig } from "./config";
import { classifyProviderError, summarizeSensitiveError, type ProviderTransportKind } from "./providerErrors";
import {
  clampBatchExecutionConfig,
  type BatchExecutionConfig,
  type BatchFailureCategory,
  type BatchImageSaveInput,
  type BatchImageSaveResult,
  type BatchStatus,
  type BatchTask,
} from "./batchTypes";

type GenerateImagesFn = typeof defaultGenerateImages;
type SaveBatchImageFn = (input: BatchImageSaveInput) => Promise<BatchImageSaveResult>;

export type RunBatchTasksInput = {
  batchId: string;
  batchTitle: string;
  batchCreatedAt: string;
  config: AppConfig;
  tasks: BatchTask[];
  executionConfig: BatchExecutionConfig;
  referenceImages: File[];
  getTaskReferenceImages?: (task: BatchTask) => File[];
  generateImages?: GenerateImagesFn;
  saveBatchImage: SaveBatchImageFn;
  onTaskUpdate?: (tasks: BatchTask[]) => void;
  shouldCancel?: () => boolean;
  shouldPause?: () => boolean;
};

export type RunBatchTasksResult = {
  status: BatchStatus;
  tasks: BatchTask[];
  pauseReason: { taskId: string; failureCategory: BatchFailureCategory; message: string } | null;
};

export async function runBatchTasks(input: RunBatchTasksInput): Promise<RunBatchTasksResult> {
  const tasks = input.tasks.map((task) => ({ ...task }));
  const executionConfig = clampBatchExecutionConfig(input.executionConfig);
  const runnableCount = Math.max(1, Math.min(executionConfig.concurrency, tasks.length || 1));
  let nextIndex = 0;
  let stoppedStatus: BatchStatus | null = null;
  let pauseReason: RunBatchTasksResult["pauseReason"] = null;

  async function worker() {
    while (!stoppedStatus) {
      if (input.shouldCancel?.()) {
        stoppedStatus = "cancelled";
        markRemainingSkipped(tasks);
        notify(input, tasks);
        return;
      }

      if (input.shouldPause?.()) {
        stoppedStatus = "paused";
        notify(input, tasks);
        return;
      }

      const task = takeNextRunnableTask(tasks, () => nextIndex++);
      if (!task) {
        return;
      }

      tasks[task.index] = {
        ...task,
        status: "running",
        attemptCount: Math.max(1, task.attemptCount + 1),
        errorMessage: "",
        failureCategory: null,
        startedAt: new Date().toISOString(),
        completedAt: "",
      };
      notify(input, tasks);

      const updated = await runOneTask({ ...input, executionConfig }, task);
      tasks[task.index] = updated;
      notify(input, tasks);

      if (updated.failureCategory === "auth" || updated.failureCategory === "cost_risk") {
        stoppedStatus = "paused";
        pauseReason = {
          taskId: updated.id,
          failureCategory: updated.failureCategory,
          message: updated.errorMessage,
        };
        return;
      }

      if (executionConfig.intervalSeconds > 0 && !stoppedStatus) {
        await delay(executionConfig.intervalSeconds * 1000);
      }
    }
  }

  await Promise.all(Array.from({ length: runnableCount }, () => worker()));

  return {
    status: stoppedStatus ?? "completed",
    tasks,
    pauseReason,
  };
}

export async function retrySingleBatchTask(
  input: Omit<RunBatchTasksInput, "tasks" | "executionConfig" | "onTaskUpdate" | "shouldCancel" | "shouldPause"> & {
    task: BatchTask;
  },
): Promise<BatchTask> {
  return runOneTask(
    {
      ...input,
      tasks: [input.task],
      executionConfig: { concurrency: 1, intervalSeconds: 0, maxRetries: 0 },
      saveBatchImage: input.saveBatchImage,
    },
    { ...input.task, status: "pending", errorMessage: "", failureCategory: null },
  );
}

async function runOneTask(input: RunBatchTasksInput, task: BatchTask): Promise<BatchTask> {
  const generateImages = input.generateImages ?? defaultGenerateImages;
  const singleImageConfig = { ...input.config, defaultCount: 1 };
  const maxAttempts = input.executionConfig.maxRetries + 1;
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt += 1;
    const startedAt = new Date();
    const runningTask: BatchTask = {
      ...task,
      status: "running",
      attemptCount: attempt,
      errorMessage: "",
      failureCategory: null,
      startedAt: startedAt.toISOString(),
      completedAt: "",
    };

    try {
      const referenceImages = resolveTaskReferenceImages(input, runningTask);
      const images = await generateImages(
        singleImageConfig,
        runningTask.prompt,
        referenceImages.length > 0 ? { referenceImages } : undefined,
      );
      const image = images[0];
      if (!image) {
        throw new Error("Image generation response did not contain any image data.");
      }

      const durationMs = Date.now() - startedAt.getTime();
      const saved = await input.saveBatchImage({
        batchId: input.batchId,
        batchTitle: input.batchTitle,
        batchCreatedAt: input.batchCreatedAt,
        task: runningTask,
        image,
        config: singleImageConfig,
        generatedAt: new Date(),
        durationMs,
      });

      return {
        ...runningTask,
        status: "succeeded",
        outputPath: saved.outputPath,
        previewUrl: saved.previewUrl,
        saveMode: saved.saveMode,
        saveFallbackReason: saved.saveFallbackReason ? summarizeSensitiveError(saved.saveFallbackReason) : undefined,
        durationMs,
        completedAt: new Date().toISOString(),
      };
    } catch (error) {
      const failureCategory = classifyBatchFailure(error);
      const message = summarizeSensitiveError(error);
      const failedTask: BatchTask = {
        ...runningTask,
        status: "failed",
        errorMessage: message,
        failureCategory,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
      };

      if (!isRetryableFailure(failureCategory) || attempt >= maxAttempts) {
        return failedTask;
      }
    }
  }

  return {
    ...task,
    status: "failed",
    errorMessage: "Batch task failed after retries.",
    failureCategory: "unknown",
  };
}

function resolveTaskReferenceImages(input: RunBatchTasksInput, task: BatchTask): File[] {
  return input.getTaskReferenceImages?.(task) ?? input.referenceImages;
}

export function classifyBatchFailure(error: unknown): BatchFailureCategory {
  const message = error instanceof Error ? error.message : String(error);
  const details = errorObject(error);
  const providerCategory = classifyProviderError({
    status: asNumber(details.status),
    kind: asProviderTransportKind(details.kind),
    message,
    code: asString(details.code),
    type: asString(details.type),
    responseBody: asString(details.responseBody),
    payload: details.payload,
  }).category;

  if (providerCategory === "auth") {
    return "auth";
  }
  if (providerCategory === "rate_limit") {
    return "rate_limit";
  }
  if (providerCategory === "timeout") {
    return "timeout";
  }
  if (providerCategory === "network") {
    return "network";
  }
  if (providerCategory === "validation") {
    return "validation";
  }
  if (providerCategory === "cost_risk") {
    return "cost_risk";
  }
  if (/did not contain any image data|no image data|empty image response/i.test(message)) {
    return "cost_risk";
  }
  if (/timed out|timeout/i.test(message)) {
    return "timeout";
  }
  if (/network|fetch failed|failed to fetch/i.test(message)) {
    return "network";
  }
  if (/valid|invalid|required|unsupported/i.test(message)) {
    return "validation";
  }

  return "unknown";
}

function takeNextRunnableTask(tasks: BatchTask[], next: () => number): BatchTask | null {
  while (true) {
    const index = next();
    if (index >= tasks.length) {
      return null;
    }

    const task = tasks[index];
    if (task.status === "pending" || task.status === "failed") {
      return task;
    }
  }
}

function isRetryableFailure(category: BatchFailureCategory): boolean {
  return category === "rate_limit" || category === "timeout" || category === "network";
}

function markRemainingSkipped(tasks: BatchTask[]) {
  for (const task of tasks) {
    if (task.status === "pending") {
      task.status = "skipped";
    }
  }
}

function notify(input: RunBatchTasksInput, tasks: BatchTask[]) {
  input.onTaskUpdate?.(tasks.map((task) => ({ ...task })));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

function errorObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function asProviderTransportKind(value: unknown): ProviderTransportKind | undefined {
  return value === "timeout" || value === "network" || value === "http" || value === "parse" ? value : undefined;
}
