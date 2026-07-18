import type {
  BatchExecutionConfig,
  BatchManifest,
  BatchManifestTask,
  BatchSource,
  BatchSummary,
  BatchTask,
} from "./batchTypes";
import type { AppConfig } from "./config";
import { sanitizeFileBaseName } from "./fileNames";
import { summarizeSensitiveError } from "./providerErrors";
import { resolveActiveProviderProfile } from "./providerProfiles";

export type BuildBatchManifestInput = {
  id: string;
  title: string;
  source: BatchSource;
  createdAt: string;
  startedAt: string;
  completedAt: string;
  executionConfig: BatchExecutionConfig;
  config: AppConfig;
  tasks: BatchTask[];
};

export function buildBatchDirectoryName(createdAt: string, title: string): string {
  const date = new Date(createdAt);
  const datePart = [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
  ].join("-");
  const timePart = [date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()]
    .map((value) => String(value).padStart(2, "0"))
    .join("");
  return `${datePart}-${timePart}-batch-${sanitizeFileBaseName(title).slice(0, 60) || "images"}`;
}

export function buildBatchImageFileName(
  task: BatchTask,
  format: AppConfig["defaultFormat"],
  existingFileNames: string[],
): string {
  const extension = format === "jpeg" ? "jpg" : format;
  const baseName = `${String(task.index + 1).padStart(3, "0")}-${sanitizeFileBaseName(
    task.suggestedName || task.title || task.prompt,
  )}`;
  const existing = new Set(existingFileNames.map((fileName) => fileName.toLowerCase()));
  let fileName = `${baseName}.${extension}`;
  let suffix = 2;

  while (existing.has(fileName.toLowerCase())) {
    fileName = `${baseName}-${suffix}.${extension}`;
    suffix += 1;
  }

  return fileName;
}

export function summarizeBatchTasks(tasks: BatchTask[]): BatchSummary {
  const startedTimes = tasks.map((task) => Date.parse(task.startedAt)).filter(Number.isFinite);
  const completedTimes = tasks.map((task) => Date.parse(task.completedAt)).filter(Number.isFinite);
  return {
    total: tasks.length,
    pending: tasks.filter((task) => task.status === "pending").length,
    running: tasks.filter((task) => task.status === "running").length,
    succeeded: tasks.filter((task) => task.status === "succeeded").length,
    failed: tasks.filter((task) => task.status === "failed").length,
    skipped: tasks.filter((task) => task.status === "skipped").length,
    memoryOnlyHistory: tasks.filter((task) => task.historyDurability === "memory-only").length,
    durationMs:
      startedTimes.length > 0 && completedTimes.length > 0
        ? Math.max(...completedTimes) - Math.min(...startedTimes)
        : 0,
  };
}

export function buildBatchManifest(input: BuildBatchManifestInput): BatchManifest {
  const activeProfile = resolveActiveProviderProfile(
    input.config.providerProfiles,
    input.config.activeProviderProfileId,
  );
  return {
    id: input.id,
    title: input.title,
    source: input.source,
    createdAt: input.createdAt,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    executionConfig: input.executionConfig,
    imageConfig: {
      model: activeProfile.imageModel,
      size: input.config.defaultSize,
      quality: input.config.defaultQuality,
      format: input.config.defaultFormat,
      outputCompression: input.config.defaultCompression,
    },
    summary: summarizeBatchTasks(input.tasks),
    tasks: input.tasks.map(sanitizeBatchManifestTask),
  };
}

export function sanitizeBatchManifest(manifest: BatchManifest): BatchManifest {
  return {
    ...manifest,
    tasks: manifest.tasks.map(sanitizeBatchManifestTask),
  };
}

function sanitizeBatchManifestTask(task: BatchTask | BatchManifestTask): BatchManifestTask {
  const nextTask = "previewUrl" in task ? { ...task } : task;
  if ("previewUrl" in nextTask) {
    delete nextTask.previewUrl;
  }

  return {
    ...nextTask,
    errorMessage: nextTask.errorMessage ? summarizeSensitiveError(nextTask.errorMessage) : "",
    saveFallbackReason: nextTask.saveFallbackReason ? summarizeSensitiveError(nextTask.saveFallbackReason) : undefined,
    historyWarning: nextTask.historyWarning ? summarizeSensitiveError(nextTask.historyWarning) : undefined,
    providerProfileSnapshot: nextTask.providerProfileSnapshot,
  };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
