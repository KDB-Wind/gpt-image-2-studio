import { formatDateFolder } from "./fileNames";

import type { ImageResponseMode } from "./config";
import type { AppConfig } from "./config";
import { resolveActiveProviderProfile } from "./providerProfiles";

export type ImageRecordStatus = "success" | "failed" | "cancelled";

export type ProviderProfileSnapshot = {
  providerProfileId: string;
  providerProfileName: string;
  imageModel: string;
  imageResponseMode: ImageResponseMode;
};

export function createProviderProfileSnapshot(config: AppConfig): ProviderProfileSnapshot {
  const profile = resolveActiveProviderProfile(config.providerProfiles, config.activeProviderProfileId);
  return {
    providerProfileId: profile.id,
    providerProfileName: profile.name,
    imageModel: profile.imageModel,
    imageResponseMode: profile.imageResponseMode,
  };
}

export type ImageRecord = {
  id: string;
  status: ImageRecordStatus;
  createdAt: string;
  prompt: string;
  optimizedPrompt: string;
  model: string;
  size: string;
  outputPath: string;
  durationMs: number;
  providerProfileSnapshot?: ProviderProfileSnapshot;
  errorMessage?: string;
  batch?: {
    id: string;
    title: string;
    createdAt: string;
    taskId: string;
    taskIndex: number;
    taskTitle: string;
    totalTasks?: number;
  };
};

export function normalizeImageRecord(value: unknown): ImageRecord | null {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || !isImageRecordStatus(value.status)
    || typeof value.createdAt !== "string"
    || typeof value.prompt !== "string"
    || typeof value.optimizedPrompt !== "string"
    || typeof value.model !== "string"
    || typeof value.size !== "string"
    || typeof value.outputPath !== "string"
    || typeof value.durationMs !== "number") {
    return null;
  }

  const record: ImageRecord = {
    id: value.id,
    status: value.status,
    createdAt: value.createdAt,
    prompt: value.prompt,
    optimizedPrompt: value.optimizedPrompt,
    model: value.model,
    size: value.size,
    outputPath: value.outputPath,
    durationMs: value.durationMs,
  };
  const snapshot = normalizeProviderProfileSnapshot(value.providerProfileSnapshot);
  if (snapshot) record.providerProfileSnapshot = snapshot;
  if (typeof value.errorMessage === "string") record.errorMessage = value.errorMessage;
  if (isRecord(value.batch)) record.batch = value.batch as ImageRecord["batch"];
  return record;
}

export function normalizeProviderProfileSnapshot(value: unknown): ProviderProfileSnapshot | undefined {
  if (!isRecord(value)
    || typeof value.providerProfileId !== "string"
    || typeof value.providerProfileName !== "string"
    || typeof value.imageModel !== "string"
    || (value.imageResponseMode !== "official" && value.imageResponseMode !== "force-base64")) {
    return undefined;
  }
  return {
    providerProfileId: value.providerProfileId,
    providerProfileName: value.providerProfileName,
    imageModel: value.imageModel,
    imageResponseMode: value.imageResponseMode,
  };
}

export function getHistoryProviderLabel(record: ImageRecord, legacyLabel = ""): string {
  if (record.providerProfileSnapshot?.providerProfileName) {
    return record.providerProfileSnapshot.providerProfileName;
  }
  return legacyLabel ? `${legacyLabel}: ${record.model}` : record.model;
}

function isImageRecordStatus(value: unknown): value is ImageRecordStatus {
  return value === "success" || value === "failed" || value === "cancelled";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export type HistoryGroup = {
  date: string;
  records: ImageRecord[];
};

export type HistoryDisplayItem =
  | {
      type: "record";
      record: ImageRecord;
    }
  | {
      type: "batch";
      id: string;
      title: string;
      createdAt: string;
      records: ImageRecord[];
      totalTasks?: number;
    };

export function sortHistoryNewestFirst(records: ImageRecord[]): ImageRecord[] {
  return [...records].sort((left, right) => {
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

export function groupHistoryByDate(records: ImageRecord[]): HistoryGroup[] {
  const groups = new Map<string, ImageRecord[]>();

  for (const record of sortHistoryNewestFirst(records)) {
    const date = getHistoryGroupDate(record);
    const existing = groups.get(date);

    if (existing) {
      existing.push(record);
      continue;
    }

    groups.set(date, [record]);
  }

  return Array.from(groups, ([date, groupedRecords]) => ({
    date,
    records: groupedRecords,
  }));
}

export function groupHistoryRecordsForDisplay(records: ImageRecord[]): HistoryDisplayItem[] {
  const sortedRecords = sortHistoryNewestFirst(records);
  const displayItems: HistoryDisplayItem[] = [];
  const batchItems = new Map<string, Extract<HistoryDisplayItem, { type: "batch" }>>();

  for (const record of sortedRecords) {
    if (!record.batch) {
      displayItems.push({ type: "record", record });
      continue;
    }

    const existingBatch = batchItems.get(record.batch.id);
    if (existingBatch) {
      existingBatch.records.push(record);
      existingBatch.records.sort(compareBatchRecords);
      continue;
    }

    const batchItem: Extract<HistoryDisplayItem, { type: "batch" }> = {
      type: "batch",
      id: record.batch.id,
      title: record.batch.title,
      createdAt: record.batch.createdAt,
      records: [record],
      totalTasks: record.batch.totalTasks,
    };

    batchItems.set(record.batch.id, batchItem);
    displayItems.push(batchItem);
  }

  return displayItems;
}

function compareBatchRecords(left: ImageRecord, right: ImageRecord): number {
  const leftIndex = left.batch?.taskIndex ?? 0;
  const rightIndex = right.batch?.taskIndex ?? 0;

  if (leftIndex !== rightIndex) {
    return leftIndex - rightIndex;
  }

  return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
}

function getHistoryGroupDate(record: ImageRecord): string {
  const outputPathDate = record.outputPath.match(/(?:^|[\\/])(\d{4}-\d{2}-\d{2})(?:[\\/]|$)/)?.[1];

  if (outputPathDate) {
    return outputPathDate;
  }

  return formatDateFolder(new Date(record.createdAt));
}
