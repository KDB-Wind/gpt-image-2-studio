import { summarizeSensitiveError } from "./providerErrors";
import {
  clampBatchTaskCount,
  type BatchFailureCategory,
  type BatchSource,
  type BatchSplitTemplateId,
  type BatchStatus,
  type BatchTask,
  type BatchTaskStatus,
  type BatchWorkspace,
} from "./batchTypes";

const BATCH_WORKSPACE_SCHEMA_VERSION = 1;
const VALID_SOURCES = new Set<BatchSource>(["same-prompt", "custom-prompts"]);
const VALID_BATCH_STATUSES = new Set<BatchStatus>(["draft", "running", "paused", "cancelled", "completed"]);
const VALID_TASK_STATUSES = new Set<BatchTaskStatus>(["pending", "running", "succeeded", "failed", "skipped"]);
const VALID_FAILURE_CATEGORIES = new Set<BatchFailureCategory>([
  "auth",
  "rate_limit",
  "timeout",
  "network",
  "validation",
  "cost_risk",
  "unknown",
]);
const VALID_SPLIT_TEMPLATE_IDS = new Set<BatchSplitTemplateId>(["basic", "style-consistent", "series", "custom"]);

export function sanitizeBatchWorkspace(value: unknown): BatchWorkspace | null {
  if (!isRecord(value) || value.schemaVersion !== BATCH_WORKSPACE_SCHEMA_VERSION) {
    return null;
  }

  const tasks = Array.isArray(value.tasks)
    ? value.tasks.map(sanitizeBatchWorkspaceTask).filter((task): task is BatchTask => task !== null)
    : [];
  const storedStatus = validValue(value.status, VALID_BATCH_STATUSES, "draft");
  const taskCount = clampBatchTaskCount(value.taskCount, Math.max(tasks.length, 1));

  return {
    schemaVersion: BATCH_WORKSPACE_SCHEMA_VERSION,
    id: stringValue(value.id),
    title: stringValue(value.title),
    source: validValue(value.source, VALID_SOURCES, "same-prompt"),
    status: storedStatus === "running" ? "paused" : storedStatus,
    createdAt: stringValue(value.createdAt),
    startedAt: stringValue(value.startedAt),
    completedAt: stringValue(value.completedAt),
    masterPrompt: stringValue(value.masterPrompt),
    styleLock: stringValue(value.styleLock),
    customPromptDrafts: Array.isArray(value.customPromptDrafts)
      ? value.customPromptDrafts.filter((item): item is string => typeof item === "string").slice(0, taskCount)
      : [],
    taskCount,
    splitTemplateId: validValue(value.splitTemplateId, VALID_SPLIT_TEMPLATE_IDS, "basic"),
    customSplitSystemPrompt: stringValue(value.customSplitSystemPrompt),
    tasks,
  };
}

function sanitizeBatchWorkspaceTask(value: unknown): BatchTask | null {
  if (!isRecord(value)) {
    return null;
  }

  const storedStatus = validValue(value.status, VALID_TASK_STATUSES, "pending");
  const status = storedStatus === "running" ? "pending" : storedStatus;
  const failureCategory = validNullableValue(value.failureCategory, VALID_FAILURE_CATEGORIES);

  return {
    id: stringValue(value.id),
    index: nonNegativeInteger(value.index),
    title: stringValue(value.title),
    prompt: stringValue(value.prompt),
    suggestedName: optionalString(value.suggestedName),
    plannerNotes: optionalString(value.plannerNotes),
    status,
    attemptCount: nonNegativeInteger(value.attemptCount),
    errorMessage: status === "pending" ? "" : sanitizeMessage(value.errorMessage),
    failureCategory: status === "pending" ? null : failureCategory,
    outputPath: stringValue(value.outputPath),
    previewUrl: "",
    saveMode: value.saveMode === "authorized-directory" || value.saveMode === "browser-download" ? value.saveMode : undefined,
    saveFallbackReason: optionalSanitizedMessage(value.saveFallbackReason),
    durationMs: nonNegativeInteger(value.durationMs),
    startedAt: status === "pending" ? "" : stringValue(value.startedAt),
    completedAt: status === "pending" ? "" : stringValue(value.completedAt),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function sanitizeMessage(value: unknown): string {
  return typeof value === "string" && value ? summarizeSensitiveError(value) : "";
}

function optionalSanitizedMessage(value: unknown): string | undefined {
  const message = sanitizeMessage(value);
  return message || undefined;
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function validValue<T extends string>(value: unknown, validValues: Set<T>, fallback: T): T {
  return typeof value === "string" && validValues.has(value as T) ? (value as T) : fallback;
}

function validNullableValue<T extends string>(value: unknown, validValues: Set<T>): T | null {
  return typeof value === "string" && validValues.has(value as T) ? (value as T) : null;
}
