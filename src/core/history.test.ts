import { describe, expect, it } from "vitest";
import {
  groupHistoryRecordsForDisplay,
  groupHistoryByDate,
  getHistoryProviderLabel,
  normalizeImageRecord,
  sortHistoryNewestFirst,
  type ImageRecord,
} from "./history";

function createRecord(overrides: Partial<ImageRecord>): ImageRecord {
  return {
    id: "record-1",
    status: "success",
    createdAt: "2026-05-01T10:00:00.000Z",
    prompt: "Prompt",
    optimizedPrompt: "Optimized prompt",
    model: "gpt-image-1",
    size: "1024x1024",
    outputPath: "outputs/2026-05-01/image.png",
    durationMs: 1200,
    ...overrides,
  };
}

describe("sortHistoryNewestFirst", () => {
  it("sorts newest first without mutating input", () => {
    const records = [
      createRecord({ id: "oldest", createdAt: "2026-05-01T08:00:00.000Z" }),
      createRecord({ id: "newest", createdAt: "2026-05-01T12:00:00.000Z" }),
      createRecord({ id: "middle", createdAt: "2026-05-01T10:00:00.000Z" }),
    ];

    const result = sortHistoryNewestFirst(records);

    expect(result.map((record) => record.id)).toEqual(["newest", "middle", "oldest"]);
    expect(records.map((record) => record.id)).toEqual(["oldest", "newest", "middle"]);
    expect(result).not.toBe(records);
  });
});

describe("groupHistoryByDate", () => {
  it("groups records by output path date labels when present", () => {
    const may2Morning = createRecord({
      id: "may-2-morning",
      createdAt: "2026-05-02T08:00:00.000Z",
      outputPath: "outputs/2026-05-02/may-2-morning.png",
    });
    const may2Night = createRecord({
      id: "may-2-night",
      createdAt: "2026-05-02T20:00:00.000Z",
      outputPath: "outputs/2026-05-03/may-2-night.png",
    });
    const may1Evening = createRecord({
      id: "may-1-evening",
      createdAt: "2026-05-01T20:00:00.000Z",
      outputPath: "outputs/2026-05-02/may-1-evening.png",
    });

    expect(groupHistoryByDate([may1Evening, may2Night, may2Morning])).toEqual([
      {
        date: "2026-05-03",
        records: [may2Night],
      },
      {
        date: "2026-05-02",
        records: [may2Morning, may1Evening],
      },
    ]);
  });

  it("uses the output path date before the createdAt-derived day in every timezone", () => {
    const outputPathWins = createRecord({
      id: "output-path-wins",
      createdAt: "2026-05-01T12:00:00.000Z",
      outputPath: "outputs/2026-04-20/output-path-wins.png",
    });

    expect(groupHistoryByDate([outputPathWins])).toEqual([
      {
        date: "2026-04-20",
        records: [outputPathWins],
      },
    ]);
  });
});

describe("provider profile snapshots", () => {
  it("keeps a non-sensitive profile snapshot and labels legacy records by their model", () => {
    const record = createRecord({
      providerProfileSnapshot: {
        providerProfileId: "profile-a",
        providerProfileName: "Profile A",
        imageModel: "image-a",
        imageResponseMode: "official",
      },
    });

    expect(normalizeImageRecord(record)).toEqual(record);
    expect(getHistoryProviderLabel(record)).toBe("Profile A");
    expect(getHistoryProviderLabel(createRecord({ model: "legacy-image" }))).toBe("legacy-image");
    expect(JSON.stringify(record)).not.toContain("apiKey");
    expect(JSON.stringify(record)).not.toContain("Authorization");
  });

  it("accepts old persisted records without a snapshot", () => {
    const legacy = createRecord({});
    expect(normalizeImageRecord(legacy)).toEqual(legacy);
    expect(getHistoryProviderLabel(legacy)).toBe(legacy.model);
  });
});

describe("groupHistoryRecordsForDisplay", () => {
  it("keeps standalone records while grouping batch records under one batch card", () => {
    const batchRecordA = createRecord({
      id: "batch-record-a",
      createdAt: "2026-05-02T08:00:00.000Z",
      prompt: "Create a France poster.",
      outputPath: "outputs/2026-05-02/batch/france.png",
      batch: {
        id: "batch-1",
        title: "World Cup posters",
        createdAt: "2026-05-02T07:59:00.000Z",
        taskId: "task-1",
        taskIndex: 0,
        taskTitle: "France poster",
        totalTasks: 2,
      },
    });
    const batchRecordB = createRecord({
      id: "batch-record-b",
      createdAt: "2026-05-02T08:01:00.000Z",
      prompt: "Create a Japan poster.",
      outputPath: "outputs/2026-05-02/batch/japan.png",
      batch: {
        id: "batch-1",
        title: "World Cup posters",
        createdAt: "2026-05-02T07:59:00.000Z",
        taskId: "task-2",
        taskIndex: 1,
        taskTitle: "Japan poster",
        totalTasks: 2,
      },
    });
    const standaloneRecord = createRecord({
      id: "standalone",
      createdAt: "2026-05-02T09:00:00.000Z",
      outputPath: "outputs/2026-05-02/standalone.png",
    });

    const result = groupHistoryRecordsForDisplay([batchRecordA, standaloneRecord, batchRecordB]);

    expect(result).toEqual([
      {
        type: "record",
        record: standaloneRecord,
      },
      {
        type: "batch",
        id: "batch-1",
        title: "World Cup posters",
        createdAt: "2026-05-02T07:59:00.000Z",
        records: [batchRecordA, batchRecordB],
        totalTasks: 2,
      },
    ]);
  });
});
