import type { ParsedImage } from "./apiClient";
import type { AppConfig } from "./config";
import type { ImageRecord, ProviderProfileSnapshot } from "./history";

export type BatchSource = "same-prompt" | "custom-prompts";
export type BatchStatus = "draft" | "running" | "paused" | "cancelled" | "completed";
export type BatchTaskStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";
export type BatchFailureCategory =
  | "auth"
  | "rate_limit"
  | "timeout"
  | "network"
  | "validation"
  | "cost_risk"
  | "unknown";
export type BatchSuggestedAction = "force-base64";

export type BatchExecutionConfig = {
  concurrency: number;
  intervalSeconds: number;
  maxRetries: number;
};

export type BatchTask = {
  id: string;
  index: number;
  title: string;
  prompt: string;
  suggestedName?: string;
  plannerNotes?: string;
  status: BatchTaskStatus;
  attemptCount: number;
  errorMessage: string;
  failureCategory: BatchFailureCategory | null;
  suggestedAction?: BatchSuggestedAction;
  outputPath: string;
  previewUrl: string;
  saveMode?: ImageSaveMode;
  saveFallbackReason?: string;
  historyDurability?: HistoryDurability;
  historyWarning?: string;
  durationMs: number;
  startedAt: string;
  completedAt: string;
  providerProfileSnapshot?: ProviderProfileSnapshot;
};

export type BatchDraft = {
  id: string;
  title: string;
  source: BatchSource;
  createdAt: string;
  tasks: BatchTask[];
};

export type BatchSummary = {
  total: number;
  pending: number;
  running: number;
  succeeded: number;
  failed: number;
  skipped: number;
  memoryOnlyHistory: number;
  durationMs: number;
};

export type BatchSplitTemplateId = "basic" | "style-consistent" | "series" | "custom";

export type BatchSplitTemplate = {
  id: BatchSplitTemplateId;
  labelKey: string;
  descriptionKey: string;
  systemPrompt: string;
};

export type BatchSplitResultItem = {
  title: string;
  prompt: string;
  suggestedName?: string;
  notes?: string;
};

export type BatchWorkspace = {
  schemaVersion: 1;
  id: string;
  title: string;
  source: BatchSource;
  status: BatchStatus;
  createdAt: string;
  startedAt: string;
  completedAt: string;
  masterPrompt: string;
  styleLock: string;
  customPromptDrafts: string[];
  taskCount: number;
  splitTemplateId: BatchSplitTemplateId;
  customSplitSystemPrompt: string;
  tasks: BatchTask[];
};

export type BatchSplitPlanningResult = {
  recommendedCount?: number;
  countReason?: string;
  items: BatchSplitResultItem[];
};

export type BatchWorkflowStepId = "draft" | "plan" | "review" | "generate" | "recover";

export type BatchWorkflowStep = {
  id: BatchWorkflowStepId;
  label: string;
};

export type BatchPromptRecipe = {
  schemaVersion: 1;
  generatedAt: string;
  title: string;
  source: BatchSource;
  masterPrompt: string;
  styleLock: string;
  taskCount: number;
  splitTemplateId: BatchSplitTemplateId;
  customSplitSystemPrompt: string;
  executionConfig: BatchExecutionConfig;
  workflowSteps: BatchWorkflowStep[];
  tasks: Array<{
    title: string;
    prompt: string;
    suggestedName?: string;
  }>;
};

export type BatchImageSaveInput = {
  batchId: string;
  batchTitle: string;
  batchCreatedAt: string;
  task: BatchTask;
  image: ParsedImage;
  config: AppConfig;
  generatedAt: Date;
  durationMs: number;
  providerProfileSnapshot?: ProviderProfileSnapshot;
};

export type ImageSaveMode = "authorized-directory" | "browser-download";
export type HistoryDurability = "persistent" | "memory-only";

export type BatchImageSaveResult = {
  record: ImageRecord;
  previewUrl: string;
  outputPath: string;
  saveMode: ImageSaveMode;
  saveFallbackReason?: string;
  historyDurability: HistoryDurability;
  historyWarning?: string;
};

export type BatchManifestTask = Pick<
  BatchTask,
  | "id"
  | "index"
  | "title"
  | "prompt"
  | "suggestedName"
  | "plannerNotes"
  | "status"
  | "attemptCount"
  | "errorMessage"
  | "failureCategory"
  | "suggestedAction"
  | "outputPath"
  | "saveMode"
  | "saveFallbackReason"
  | "historyDurability"
  | "historyWarning"
  | "durationMs"
  | "startedAt"
  | "completedAt"
  | "providerProfileSnapshot"
>;

export type BatchManifest = {
  id: string;
  title: string;
  source: BatchSource;
  createdAt: string;
  startedAt: string;
  completedAt: string;
  executionConfig: BatchExecutionConfig;
  imageConfig: {
    model: string;
    size: string;
    quality: string;
    format: string;
    outputCompression: number;
  };
  summary: BatchSummary;
  tasks: BatchManifestTask[];
};

export const DEFAULT_BATCH_EXECUTION_CONFIG: BatchExecutionConfig = {
  concurrency: 1,
  intervalSeconds: 20,
  maxRetries: 1,
};

export const DEFAULT_BATCH_TASK_COUNT = 5;
export const MAX_BATCH_TASK_COUNT = 20;
export const MAX_BATCH_CONCURRENCY = 10;

export function clampBatchExecutionConfig(value: Partial<BatchExecutionConfig>): BatchExecutionConfig {
  return {
    concurrency: clampBatchConcurrency(value.concurrency),
    intervalSeconds: clampInteger(value.intervalSeconds, 0, 300, DEFAULT_BATCH_EXECUTION_CONFIG.intervalSeconds),
    maxRetries: clampInteger(value.maxRetries, 0, 3, DEFAULT_BATCH_EXECUTION_CONFIG.maxRetries),
  };
}

export function clampBatchConcurrency(value: unknown, fallback = DEFAULT_BATCH_EXECUTION_CONFIG.concurrency): number {
  return clampInteger(value, 1, MAX_BATCH_CONCURRENCY, fallback);
}

export function clampBatchTaskCount(value: unknown, fallback = DEFAULT_BATCH_TASK_COUNT): number {
  return clampInteger(value, 1, MAX_BATCH_TASK_COUNT, fallback);
}

export function createBatchId(isoTimestamp = new Date().toISOString()): string {
  return `batch-${isoTimestamp.replace(/[-:]/g, "").slice(0, 15).replace("T", "-")}`;
}

export function isTerminalBatchTaskStatus(status: BatchTaskStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "skipped";
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === "number" ? value : fallback;
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(numeric)));
}
