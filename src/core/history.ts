import { formatDateFolder } from "./fileNames";

export type ImageRecordStatus = "success" | "failed" | "cancelled";

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
