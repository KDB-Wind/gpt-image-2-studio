import type { ParsedImage } from "./apiClient";
import type { AppConfig } from "./config";
import type { ImageRecord } from "./history";

export type BatchSource = "same-prompt" | "multi-line" | "ai-split";
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
  status: BatchTaskStatus;
  attemptCount: number;
  errorMessage: string;
  failureCategory: BatchFailureCategory | null;
  outputPath: string;
  previewUrl: string;
  durationMs: number;
  startedAt: string;
  completedAt: string;
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
};

export type BatchImageSaveResult = {
  record: ImageRecord;
  previewUrl: string;
  outputPath: string;
};

export type BatchManifestTask = Pick<
  BatchTask,
  | "id"
  | "index"
  | "title"
  | "prompt"
  | "status"
  | "attemptCount"
  | "errorMessage"
  | "failureCategory"
  | "outputPath"
  | "durationMs"
  | "startedAt"
  | "completedAt"
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

export function clampBatchExecutionConfig(value: Partial<BatchExecutionConfig>): BatchExecutionConfig {
  return {
    concurrency: clampInteger(value.concurrency, 1, 3, DEFAULT_BATCH_EXECUTION_CONFIG.concurrency),
    intervalSeconds: clampInteger(value.intervalSeconds, 0, 300, DEFAULT_BATCH_EXECUTION_CONFIG.intervalSeconds),
    maxRetries: clampInteger(value.maxRetries, 0, 3, DEFAULT_BATCH_EXECUTION_CONFIG.maxRetries),
  };
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
