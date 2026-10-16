import { generateImages as defaultGenerateImages } from "./apiClient";
import type { AppConfig } from "./config";
import { createProviderProfileSnapshot } from "./history";
import { isImageDownloadError } from "./imageDownloadError";
import { classifyProviderError, summarizeSensitiveError, type ProviderTransportKind } from "./providerErrors";
import {
  clampBatchExecutionConfig,
  type BatchExecutionConfig,
  type BatchFailureCategory,
  type BatchImageSaveInput,
  type BatchImageSaveResult,
  type BatchStatus,
  type BatchSuggestedAction,
  type BatchTask,
} from "./batchTypes";

type GenerateImagesFn = typeof defaultGenerateImages;
type SaveBatchImageFn = (input: BatchImageSaveInput) => Promise<BatchImageSaveResult>;

// Generated payloads stay in this session only: workspace/history serialization
// must never include image data or provider credentials. A persisted retry-save
// marker prevents a reload from silently turning recovery into paid generation.
const pendingImageSaves = new Map<string, BatchImageSaveInput>();

export type RunBatchTasksInput = {
  batchId: string;
  batchTitle: string;
  batchCreatedAt: string;
  batchTotalTasks?: number;
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
        suggestedAction: task.suggestedAction === "retry-save" ? "retry-save" : undefined,
        startedAt: new Date().toISOString(),
        completedAt: "",
      };
      notify(input, tasks);

      const updated = await runOneTask({
        ...input,
        executionConfig,
        shouldPause: () => Boolean(stoppedStatus) || Boolean(input.shouldPause?.()),
      }, task, savingTask => {
        tasks[task.index] = savingTask;
        notify(input, tasks);
      });
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

      if (executionConfig.intervalSeconds > 0 && !stoppedStatus
        && tasks.slice(nextIndex).some((remaining) => remaining.status === "pending" || remaining.status === "failed")) {
        await waitWhileActive(executionConfig.intervalSeconds * 1000, input, () => Boolean(stoppedStatus));
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
  input: Omit<RunBatchTasksInput, "tasks" | "executionConfig" | "shouldCancel" | "shouldPause"> & {
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
    savingTask => input.onTaskUpdate?.([savingTask]),
  );
}

async function runOneTask(
  input: RunBatchTasksInput,
  task: BatchTask,
  onSaving?: (task: BatchTask) => void,
): Promise<BatchTask> {
  const generateImages = input.generateImages ?? defaultGenerateImages;
  const singleImageConfig = { ...input.config, defaultCount: 1 };
  const providerProfileSnapshot = createProviderProfileSnapshot(singleImageConfig);
  const maxAttempts = input.executionConfig.maxRetries + 1;
  let attempt = 0;
  let retryWaitMs = 0;
  const recoveryKey = JSON.stringify([input.batchId, task.id]);

  while (attempt < maxAttempts) {
    attempt += 1;
    const startedAt = new Date();
    const runningTask: BatchTask = {
      ...task,
      providerProfileSnapshot,
      status: "running",
      attemptCount: attempt,
      errorMessage: "",
      failureCategory: null,
      suggestedAction: undefined,
      startedAt: startedAt.toISOString(),
      completedAt: "",
    };

    let savingGeneratedImage = task.suggestedAction === "retry-save";
    try {
      let saveInput = pendingImageSaves.get(recoveryKey);
      if (!saveInput && task.suggestedAction === "retry-save") {
        throw new Error("Generated image is no longer available in this session. Start a new task explicitly to generate again.");
      }
      if (!saveInput) {
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

        saveInput = {
          batchId: input.batchId,
          batchTitle: input.batchTitle,
          batchCreatedAt: input.batchCreatedAt,
          totalTasks: input.batchTotalTasks ?? input.tasks.length,
          task: runningTask,
          image,
          config: {
            ...singleImageConfig,
            apiKey: "",
            providerProfiles: singleImageConfig.providerProfiles.map(profile => ({ ...profile, apiKey: "" })),
          },
          generatedAt: new Date(),
          durationMs: Date.now() - startedAt.getTime(),
          providerProfileSnapshot,
        };
        pendingImageSaves.set(recoveryKey, saveInput);
      }
      savingGeneratedImage = true;
      // Publish recovery before awaiting disk/history I/O. A refresh during
      // this await must not restore the task as a fresh paid generation.
      runningTask.suggestedAction = "retry-save";
      onSaving?.(runningTask);
      const saved = await input.saveBatchImage({
        ...saveInput,
        config: { ...saveInput.config, outputDirectory: input.config.outputDirectory },
      });
      pendingImageSaves.delete(recoveryKey);

      return {
        ...runningTask,
        status: "succeeded",
        outputPath: saved.outputPath,
        previewUrl: saved.previewUrl,
        saveMode: saved.saveMode,
        saveFallbackReason: saved.saveFallbackReason ? summarizeSensitiveError(saved.saveFallbackReason) : undefined,
        historyDurability: saved.historyDurability,
        historyWarning: saved.historyWarning ? summarizeSensitiveError(saved.historyWarning) : undefined,
        suggestedAction: undefined,
        durationMs: saveInput.durationMs,
        completedAt: new Date().toISOString(),
        providerProfileSnapshot: saveInput.providerProfileSnapshot,
      };
    } catch (error) {
      const failureCategory = savingGeneratedImage ? "cost_risk" : classifyBatchFailure(error);
      // URL download is part of the adapter's save path. Keep its actionable
      // CORS hint; ordinary disk/history failures still recover by saving only.
      const suggestedAction = getSuggestedAction(error) ?? (savingGeneratedImage ? "retry-save" : undefined);
      const message = savingGeneratedImage
        ? `Image generation has completed; saving needs attention. ${summarizeSensitiveError(error)}`
        : summarizeSensitiveError(error);
      const failedTask: BatchTask = {
        ...runningTask,
        status: "failed",
        errorMessage: message,
        failureCategory,
        suggestedAction,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
      };

      if (!isRetryableFailure(failureCategory) || attempt >= maxAttempts) {
        return failedTask;
      }
      if (input.shouldCancel?.() || input.shouldPause?.()) return failedTask;
      const serverDelay = asNumber(errorObject(error).retryAfterMs);
      const serverDelayMs = typeof serverDelay === "number" && Number.isFinite(serverDelay) && serverDelay >= 0 ? serverDelay : 0;
      const delayMs = Math.max(
        serverDelayMs,
        1_000 * 2 ** (attempt - 1),
      ) + Math.floor(Math.random() * 250);
      // A server hint is a minimum. Decline a wait above the total budget
      // instead of capping it and sending a request sooner than permitted.
      if (delayMs > 60_000 - retryWaitMs) return failedTask;
      const waitStartedAt = Date.now();
      await waitWhileActive(delayMs, input);
      retryWaitMs += Date.now() - waitStartedAt;
      if (input.shouldCancel?.() || input.shouldPause?.()) return failedTask;
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
  if (isImageDownloadError(error)) {
    return "cost_risk";
  }

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

function getSuggestedAction(error: unknown): BatchSuggestedAction | undefined {
  if (!isImageDownloadError(error)) {
    return undefined;
  }

  if (error.code === "image-url-cors") {
    return "force-base64";
  }

  return undefined;
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
  return category === "rate_limit";
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

async function waitWhileActive(ms: number, input: RunBatchTasksInput, stopped?: () => boolean): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline && !stopped?.() && !input.shouldCancel?.() && !input.shouldPause?.()) {
    await delay(Math.min(100, deadline - Date.now()));
  }
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
