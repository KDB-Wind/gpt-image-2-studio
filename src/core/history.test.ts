import { describe, expect, it } from "vitest";
import {
  filterHistoryRecords,
  groupHistoryByDate,
  removeHistoryRecords,
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

describe("filterHistoryRecords", () => {
  const records = [
    createRecord({
      id: "portrait",
      status: "success",
      prompt: "Graduation portrait with soft daylight",
      optimizedPrompt: "Cinematic graduation portrait",
      model: "gpt-image-2",
      outputPath: "outputs/2026-05-01/portrait.png",
    }),
    createRecord({
      id: "product",
      status: "failed",
      prompt: "Luxury watch product ad",
      optimizedPrompt: "",
      errorMessage: "provider timeout",
      outputPath: "outputs/2026-05-01/product.png",
    }),
    createRecord({
      id: "cancelled",
      status: "cancelled",
      prompt: "Interior design mood board",
      optimizedPrompt: "",
      outputPath: "outputs/2026-05-01/interior.png",
    }),
  ];

  it("searches prompt, optimized prompt, model, output path, and error text case-insensitively", () => {
    expect(filterHistoryRecords(records, { query: "CINEMATIC", status: "all" }).map((record) => record.id)).toEqual([
      "portrait",
    ]);
    expect(filterHistoryRecords(records, { query: "watch", status: "all" }).map((record) => record.id)).toEqual([
      "product",
    ]);
    expect(filterHistoryRecords(records, { query: "timeout", status: "all" }).map((record) => record.id)).toEqual([
      "product",
    ]);
  });

  it("filters by status and keeps all records when status is all", () => {
    expect(filterHistoryRecords(records, { query: "", status: "failed" }).map((record) => record.id)).toEqual([
      "product",
    ]);
    expect(filterHistoryRecords(records, { query: "", status: "all" }).map((record) => record.id)).toEqual([
      "portrait",
      "product",
      "cancelled",
    ]);
  });
});

describe("removeHistoryRecords", () => {
  it("removes selected records without mutating the original array", () => {
    const records = [
      createRecord({ id: "keep" }),
      createRecord({ id: "remove-one" }),
      createRecord({ id: "remove-two" }),
    ];

    const result = removeHistoryRecords(records, new Set(["remove-one", "remove-two"]));

    expect(result.map((record) => record.id)).toEqual(["keep"]);
    expect(records.map((record) => record.id)).toEqual(["keep", "remove-one", "remove-two"]);
  });
});
