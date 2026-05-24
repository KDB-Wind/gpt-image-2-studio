import { describe, expect, it } from "vitest";

import { buildBatchPreview } from "./batchPreview";
import type { BatchTask } from "./batchTypes";

describe("buildBatchPreview", () => {
  it("summarizes batch tasks and selects the latest generated image", () => {
    const tasks: BatchTask[] = [
      createTask({
        id: "task-1",
        index: 0,
        title: "France poster",
        status: "succeeded",
        previewUrl: "blob:france",
        outputPath: "images/france.png",
        completedAt: "2026-05-24T01:00:00.000Z",
      }),
      createTask({
        id: "task-2",
        index: 1,
        title: "Japan poster",
        status: "running",
        prompt: "Create a Japan poster.",
        startedAt: "2026-05-24T01:02:00.000Z",
      }),
      createTask({
        id: "task-3",
        index: 2,
        title: "Belgium poster",
        status: "succeeded",
        previewUrl: "blob:belgium",
        outputPath: "images/belgium.png",
        completedAt: "2026-05-24T01:03:00.000Z",
      }),
    ];

    const preview = buildBatchPreview({ status: "running", tasks });

    expect(preview?.summary).toMatchObject({ total: 3, running: 1, succeeded: 2 });
    expect(preview?.latestImage?.title).toBe("Belgium poster");
    expect(preview?.latestImage?.previewUrl).toBe("blob:belgium");
    expect(preview?.runningTask?.title).toBe("Japan poster");
    expect(preview?.images.map((image) => image.title)).toEqual(["France poster", "Belgium poster"]);
  });

  it("returns null when no batch tasks exist", () => {
    expect(buildBatchPreview({ status: "draft", tasks: [] })).toBeNull();
  });
});

function createTask(overrides: Partial<BatchTask>): BatchTask {
  return {
    id: "task",
    index: 0,
    title: "Task",
    prompt: "Create an image.",
    status: "pending",
    attemptCount: 0,
    errorMessage: "",
    failureCategory: null,
    outputPath: "",
    previewUrl: "",
    durationMs: 0,
    startedAt: "",
    completedAt: "",
    ...overrides,
  };
}
