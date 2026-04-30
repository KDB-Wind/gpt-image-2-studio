import { describe, expect, it } from "vitest";
import { formatDateFolder } from "./fileNames";
import {
  groupHistoryByDate,
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
  it("groups records by local date label", () => {
    const may2Morning = createRecord({
      id: "may-2-morning",
      createdAt: "2026-05-02T08:00:00.000Z",
    });
    const may2Night = createRecord({
      id: "may-2-night",
      createdAt: "2026-05-02T20:00:00.000Z",
    });
    const may1Evening = createRecord({
      id: "may-1-evening",
      createdAt: "2026-05-01T20:00:00.000Z",
    });

    const expectedGroups = new Map<string, ImageRecord[]>();
    for (const record of [may2Night, may2Morning, may1Evening]) {
      const date = formatDateFolder(new Date(record.createdAt));
      const records = expectedGroups.get(date);

      if (records) {
        records.push(record);
        continue;
      }

      expectedGroups.set(date, [record]);
    }

    expect(groupHistoryByDate([may1Evening, may2Night, may2Morning])).toEqual(
      Array.from(expectedGroups, ([date, records]) => ({ date, records })),
    );
  });
});
