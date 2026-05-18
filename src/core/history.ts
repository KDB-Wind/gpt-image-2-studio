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
};

export type HistoryGroup = {
  date: string;
  records: ImageRecord[];
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

function getHistoryGroupDate(record: ImageRecord): string {
  const outputPathDate = record.outputPath.match(/(?:^|[\\/])(\d{4}-\d{2}-\d{2})(?:[\\/]|$)/)?.[1];

  if (outputPathDate) {
    return outputPathDate;
  }

  return formatDateFolder(new Date(record.createdAt));
}
