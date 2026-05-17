import { describe, expect, it, vi } from "vitest";
import { createTasksFromMultilinePrompts } from "./batchPlanner";
import { runBatchTasks, retrySingleBatchTask } from "./batchRunner";
import { DEFAULT_CONFIG } from "./config";
import type { BatchImageSaveInput, BatchImageSaveResult } from "./batchTypes";

function createSaveResult(input: BatchImageSaveInput): BatchImageSaveResult {
  return {
    record: {
      id: input.task.id,
      status: "success",
      createdAt: "2026-05-17T12:00:00.000Z",
      prompt: input.task.prompt,
      optimizedPrompt: "",
      model: DEFAULT_CONFIG.imageModel,
      size: DEFAULT_CONFIG.defaultSize,
      outputPath: `outputs/${input.task.id}.png`,
      durationMs: 1,
    },
    previewUrl: `blob:${input.task.id}`,
    outputPath: `outputs/${input.task.id}.png`,
  };
}

describe("batchRunner", () => {
  it("runs tasks in order with concurrency 1", async () => {
    const calls: string[] = [];
    const tasks = createTasksFromMultilinePrompts("one\ntwo\nthree");
    const result = await runBatchTasks({
      batchId: "batch-1",
      batchTitle: "Batch",
      batchCreatedAt: "2026-05-17T12:00:00.000Z",
      config: DEFAULT_CONFIG,
      tasks,
      executionConfig: { concurrency: 1, intervalSeconds: 0, maxRetries: 0 },
      referenceImages: [],
      generateImages: async (_config, prompt) => {
        calls.push(prompt);
        return [{ base64: btoa(prompt) }];
      },
      saveBatchImage: async (input) => createSaveResult(input),
    });

    expect(calls).toEqual(["one", "two", "three"]);
    expect(result.status).toBe("completed");
    expect(result.tasks.every((task) => task.status === "succeeded")).toBe(true);
  });

  it("does not exceed the configured concurrency", async () => {
    let active = 0;
    let maxActive = 0;
    const tasks = createTasksFromMultilinePrompts("one\ntwo\nthree");
    const result = await runBatchTasks({
      batchId: "batch-1",
      batchTitle: "Batch",
      batchCreatedAt: "2026-05-17T12:00:00.000Z",
      config: DEFAULT_CONFIG,
      tasks,
      executionConfig: { concurrency: 2, intervalSeconds: 0, maxRetries: 0 },
      referenceImages: [],
      generateImages: async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => window.setTimeout(resolve, 1));
        active -= 1;
        return [{ base64: "ok" }];
      },
      saveBatchImage: async (input) => createSaveResult(input),
    });

    expect(maxActive).toBe(2);
    expect(result.status).toBe("completed");
  });

  it("retries retryable failures", async () => {
    const tasks = createTasksFromMultilinePrompts("one");
    let attempts = 0;
    const result = await runBatchTasks({
      batchId: "batch-1",
      batchTitle: "Batch",
      batchCreatedAt: "2026-05-17T12:00:00.000Z",
      config: DEFAULT_CONFIG,
      tasks,
      executionConfig: { concurrency: 1, intervalSeconds: 0, maxRetries: 1 },
      referenceImages: [],
      generateImages: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("Request timed out after 5 seconds.");
        }
        return [{ base64: "ok" }];
      },
      saveBatchImage: async (input) => createSaveResult(input),
    });

    expect(attempts).toBe(2);
    expect(result.tasks[0].status).toBe("succeeded");
  });

  it("pauses the whole batch on cost-risk errors", async () => {
    const tasks = createTasksFromMultilinePrompts("one\ntwo");
    const result = await runBatchTasks({
      batchId: "batch-1",
      batchTitle: "Batch",
      batchCreatedAt: "2026-05-17T12:00:00.000Z",
      config: DEFAULT_CONFIG,
      tasks,
      executionConfig: { concurrency: 1, intervalSeconds: 0, maxRetries: 0 },
      referenceImages: [],
      generateImages: async () => {
        throw new Error("Image generation response did not contain any image data.");
      },
      saveBatchImage: vi.fn(),
    });

    expect(result.status).toBe("paused");
    expect(result.pauseReason?.failureCategory).toBe("cost_risk");
    expect(result.tasks[0].status).toBe("failed");
    expect(result.tasks[1].status).toBe("pending");
  });

  it("retries one failed task without changing successful tasks", async () => {
    const tasks = createTasksFromMultilinePrompts("one\ntwo").map((task, index) => ({
      ...task,
      status: index === 0 ? ("succeeded" as const) : ("failed" as const),
    }));
    const retried = await retrySingleBatchTask({
      batchId: "batch-1",
      batchTitle: "Batch",
      batchCreatedAt: "2026-05-17T12:00:00.000Z",
      config: DEFAULT_CONFIG,
      task: tasks[1],
      referenceImages: [],
      generateImages: async () => [{ base64: "ok" }],
      saveBatchImage: async (input) => createSaveResult(input),
    });

    expect(retried.status).toBe("succeeded");
    expect(tasks[0].status).toBe("succeeded");
  });
});
