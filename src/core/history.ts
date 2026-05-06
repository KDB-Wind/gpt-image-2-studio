import { formatDateFolder } from "./fileNames";

export type ImageRecordStatus = "success" | "failed" | "cancelled";
export type HistoryStatusFilter = ImageRecordStatus | "all";

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

export type HistoryFilter = {
  query: string;
  status: HistoryStatusFilter;
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

export function filterHistoryRecords(records: ImageRecord[], filter: HistoryFilter): ImageRecord[] {
  const query = filter.query.trim().toLowerCase();

  return records.filter((record) => {
    if (filter.status !== "all" && record.status !== filter.status) {
      return false;
    }

    if (!query) {
      return true;
    }

    return [
      record.prompt,
      record.optimizedPrompt,
      record.model,
      record.size,
      record.outputPath,
      record.errorMessage ?? "",
    ]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
}

export function removeHistoryRecords(records: ImageRecord[], ids: ReadonlySet<string>): ImageRecord[] {
  if (ids.size === 0) {
    return [...records];
  }

  return records.filter((record) => !ids.has(record.id));
}

function getHistoryGroupDate(record: ImageRecord): string {
  const outputPathDate = record.outputPath.match(/(?:^|[\\/])(\d{4}-\d{2}-\d{2})(?:[\\/]|$)/)?.[1];

  if (outputPathDate) {
    return outputPathDate;
  }

  return formatDateFolder(new Date(record.createdAt));
}
