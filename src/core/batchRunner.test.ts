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
    saveMode: "authorized-directory",
    historyDurability: "persistent",
  };
}

describe("batchRunner", () => {
  it("passes the active provider snapshot into batch saves and task state", async () => {
    let savedInput: BatchImageSaveInput | undefined;
    const result = await runBatchTasks({
      batchId: "batch-1",
      batchTitle: "Batch",
      batchCreatedAt: "2026-05-17T12:00:00.000Z",
      config: {
        ...DEFAULT_CONFIG,
        providerProfiles: [{
          ...DEFAULT_CONFIG.providerProfiles[0],
          id: "profile-a",
          name: "Profile A",
          imageModel: "image-a",
        }],
        activeProviderProfileId: "profile-a",
      },
      tasks: createTasksFromMultilinePrompts("one"),
      executionConfig: { concurrency: 1, intervalSeconds: 0, maxRetries: 0 },
      referenceImages: [],
      generateImages: async () => [{ base64: "ok" }],
      saveBatchImage: async (input) => {
        savedInput = input;
        return createSaveResult(input);
      },
    });

    expect(savedInput?.providerProfileSnapshot).toEqual({
      providerProfileId: "profile-a",
      providerProfileName: "Profile A",
      imageModel: "image-a",
      imageResponseMode: "official",
    });
    expect(result.tasks[0].providerProfileSnapshot).toEqual(savedInput?.providerProfileSnapshot);
  });
  it("normalizes every batch child to one requested image", async () => {
    const requestedCounts: number[] = [];

    await runBatchTasks({
      batchId: "batch-1",
      batchTitle: "Batch",
      batchCreatedAt: "2026-05-17T12:00:00.000Z",
      config: { ...DEFAULT_CONFIG, defaultCount: 4 },
      tasks: createTasksFromMultilinePrompts("one\ntwo\nthree"),
      executionConfig: { concurrency: 1, intervalSeconds: 0, maxRetries: 0 },
      referenceImages: [],
      generateImages: async (config) => {
        requestedCounts.push(config.defaultCount);
        return [{ base64: "ok" }];
      },
      saveBatchImage: async (input) => createSaveResult(input),
    });

    expect(requestedCounts).toEqual([1, 1, 1]);
  });

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

  it("retains browser-download fallback facts on a successful task", async () => {
    const result = await runBatchTasks({
      batchId: "batch-1",
      batchTitle: "Batch",
      batchCreatedAt: "2026-05-17T12:00:00.000Z",
      config: DEFAULT_CONFIG,
      tasks: createTasksFromMultilinePrompts("one"),
      executionConfig: { concurrency: 1, intervalSeconds: 0, maxRetries: 0 },
      referenceImages: [],
      generateImages: async () => [{ base64: "ok" }],
      saveBatchImage: async (input) => ({
        ...createSaveResult(input),
        saveMode: "browser-download",
        saveFallbackReason: "permission denied",
      }),
    });

    expect(result.tasks[0]).toMatchObject({
      status: "succeeded",
      saveMode: "browser-download",
      saveFallbackReason: "permission denied",
    });
  });

  it("stores a sanitized fallback summary on a successful task", async () => {
    const bearerSecret = ["sk", "live-super-secret"].join("-");
    const rawFallback =
      `HTTP 403 Authorization: Bearer ${bearerSecret} failed at https://provider.example/image.png?access_token=private-token ` +
      'body={"error":{"message":"Forbidden","api_key":"sk-body-secret"}}';
    const result = await runBatchTasks({
      batchId: "batch-1",
      batchTitle: "Batch",
      batchCreatedAt: "2026-05-17T12:00:00.000Z",
      config: DEFAULT_CONFIG,
      tasks: createTasksFromMultilinePrompts("one"),
      executionConfig: { concurrency: 1, intervalSeconds: 0, maxRetries: 0 },
      referenceImages: [],
      generateImages: async () => [{ base64: "ok" }],
      saveBatchImage: async (input) => ({
        ...createSaveResult(input),
        saveMode: "browser-download",
        saveFallbackReason: rawFallback,
      }),
    });

    expect(result.tasks[0].saveFallbackReason).toContain("HTTP 403");
    expect(result.tasks[0].saveFallbackReason).toContain("auth");
    expect(result.tasks[0].saveFallbackReason).not.toContain(bearerSecret);
    expect(result.tasks[0].saveFallbackReason).not.toContain("private-token");
    expect(result.tasks[0].saveFallbackReason).not.toContain("provider.example");
    expect(result.tasks[0].saveFallbackReason).not.toContain("sk-body-secret");
    expect(result.tasks[0].saveFallbackReason?.length).toBeLessThanOrEqual(280);
  });

  it("retains authorized-directory facts on a successful task", async () => {
    const result = await runBatchTasks({
      batchId: "batch-1",
      batchTitle: "Batch",
      batchCreatedAt: "2026-05-17T12:00:00.000Z",
      config: DEFAULT_CONFIG,
      tasks: createTasksFromMultilinePrompts("one"),
      executionConfig: { concurrency: 1, intervalSeconds: 0, maxRetries: 0 },
      referenceImages: [],
      generateImages: async () => [{ base64: "ok" }],
      saveBatchImage: async (input) => createSaveResult(input),
    });

    expect(result.tasks[0]).toMatchObject({
      status: "succeeded",
      saveMode: "authorized-directory",
    });
  });

  it("retains a sanitized memory-only history warning on a successful task", async () => {
    const result = await runBatchTasks({
      batchId: "batch-1",
      batchTitle: "Batch",
      batchCreatedAt: "2026-05-17T12:00:00.000Z",
      config: DEFAULT_CONFIG,
      tasks: createTasksFromMultilinePrompts("one"),
      executionConfig: { concurrency: 1, intervalSeconds: 0, maxRetries: 0 },
      referenceImages: [],
      generateImages: async () => [{ base64: "ok" }],
      saveBatchImage: async (input) => ({
        ...createSaveResult(input),
        historyDurability: "memory-only",
        historyWarning: "History is only in this open app instance.",
      }),
    });

    expect(result.tasks[0]).toMatchObject({
      status: "succeeded",
      historyDurability: "memory-only",
      historyWarning: "History is only in this open app instance.",
    });
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

  it("allows five concurrent image API calls when concurrency is set to five", async () => {
    let active = 0;
    let maxActive = 0;
    const tasks = createTasksFromMultilinePrompts("one\ntwo\nthree\nfour\nfive");
    const result = await runBatchTasks({
      batchId: "batch-1",
      batchTitle: "Batch",
      batchCreatedAt: "2026-05-17T12:00:00.000Z",
      config: DEFAULT_CONFIG,
      tasks,
      executionConfig: { concurrency: 5, intervalSeconds: 0, maxRetries: 0 },
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

    expect(maxActive).toBe(5);
    expect(result.status).toBe("completed");
  });

  it("can resolve reference images per task instead of reusing one shared set", async () => {
    const tasks = createTasksFromMultilinePrompts("one\ntwo");
    const sharedReference = new File(["shared"], "shared.png", { type: "image/png" });
    const taskReferences = [
      new File(["task-a"], "task-a.png", { type: "image/png" }),
      new File(["task-b"], "task-b.png", { type: "image/png" }),
    ];
    const calls: File[][] = [];

    const result = await runBatchTasks({
      batchId: "batch-1",
      batchTitle: "Batch",
      batchCreatedAt: "2026-05-17T12:00:00.000Z",
      config: DEFAULT_CONFIG,
      tasks,
      executionConfig: { concurrency: 1, intervalSeconds: 0, maxRetries: 0 },
      referenceImages: [sharedReference],
      getTaskReferenceImages: (task) => [sharedReference, taskReferences[task.index]],
      generateImages: async (_config, _prompt, options) => {
        calls.push(options?.referenceImages ?? []);
        return [{ base64: "ok" }];
      },
      saveBatchImage: async (input) => createSaveResult(input),
    });

    expect(result.status).toBe("completed");
    expect(calls).toEqual([
      [sharedReference, taskReferences[0]],
      [sharedReference, taskReferences[1]],
    ]);
  });

  it("retries a definitively rejected rate-limit response", async () => {
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
          throw Object.assign(new Error("Too many requests."), { status: 429 });
        }
        return [{ base64: "ok" }];
      },
      saveBatchImage: async (input) => createSaveResult(input),
    });

    expect(attempts).toBe(2);
    expect(result.tasks[0].status).toBe("succeeded");
  });

  it.each([
    ["timeout", new Error("Request timed out after 5 seconds.")],
    ["network", new Error("Failed to fetch")],
    ["HTTP 408", Object.assign(new Error("Request timeout."), { status: 408 })],
    ["HTTP 500", Object.assign(new Error("Upstream failed."), { status: 500 })],
    ["unknown", new Error("Unexpected provider outcome.")],
  ])("does not automatically retry an ambiguous %s failure", async (_label, failure) => {
    const tasks = createTasksFromMultilinePrompts("one");
    const generateImages = vi.fn().mockRejectedValue(failure);

    const result = await runBatchTasks({
      batchId: "batch-1",
      batchTitle: "Batch",
      batchCreatedAt: "2026-05-17T12:00:00.000Z",
      config: DEFAULT_CONFIG,
      tasks,
      executionConfig: { concurrency: 1, intervalSeconds: 0, maxRetries: 3 },
      referenceImages: [],
      generateImages,
      saveBatchImage: vi.fn(),
    });

    expect(generateImages).toHaveBeenCalledTimes(1);
    expect(result.tasks[0].status).toBe("failed");
  });

  it("bounds rate-limit retries by maxRetries", async () => {
    const tasks = createTasksFromMultilinePrompts("one");
    const generateImages = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error("Too many requests."), { status: 429 }));

    const result = await runBatchTasks({
      batchId: "batch-1",
      batchTitle: "Batch",
      batchCreatedAt: "2026-05-17T12:00:00.000Z",
      config: DEFAULT_CONFIG,
      tasks,
      executionConfig: { concurrency: 1, intervalSeconds: 0, maxRetries: 2 },
      referenceImages: [],
      generateImages,
      saveBatchImage: vi.fn(),
    });

    expect(generateImages).toHaveBeenCalledTimes(3);
    expect(result.tasks[0].status).toBe("failed");
    expect(result.tasks[0].failureCategory).toBe("rate_limit");
  });

  it("submits an ambiguous 429 exactly once even when automatic retries are configured", async () => {
    const tasks = createTasksFromMultilinePrompts("one");
    const generateImages = vi.fn().mockRejectedValue(
      Object.assign(new Error("Request failed after upstream processing."), {
        status: 429,
        responseBody:
          '{"error":{"message":"upstream error: do request failed","type":"new_api_error","code":"bad_response_status_code"}}',
      }),
    );

    const result = await runBatchTasks({
      batchId: "batch-1",
      batchTitle: "Batch",
      batchCreatedAt: "2026-05-17T12:00:00.000Z",
      config: DEFAULT_CONFIG,
      tasks,
      executionConfig: { concurrency: 1, intervalSeconds: 0, maxRetries: 3 },
      referenceImages: [],
      generateImages,
      saveBatchImage: vi.fn(),
    });

    expect(generateImages).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("paused");
    expect(result.pauseReason?.failureCategory).toBe("cost_risk");
    expect(result.tasks[0]).toMatchObject({
      status: "failed",
      attemptCount: 1,
      failureCategory: "cost_risk",
    });
  });

  it("stores a sanitized task error summary instead of the raw provider body", async () => {
    const tasks = createTasksFromMultilinePrompts("one");
    const result = await runBatchTasks({
      batchId: "batch-1",
      batchTitle: "Batch",
      batchCreatedAt: "2026-05-17T12:00:00.000Z",
      config: DEFAULT_CONFIG,
      tasks,
      executionConfig: { concurrency: 1, intervalSeconds: 0, maxRetries: 0 },
      referenceImages: [],
      generateImages: async () => {
        const error = new Error(
          'HTTP 403 upstream failure: {"error":{"message":"Forbidden","token":"private-token","api_key":"sk-secret"}}',
        );
        Object.assign(error, { status: 403 });
        throw error;
      },
      saveBatchImage: vi.fn(),
    });

    expect(result.tasks[0].status).toBe("failed");
    expect(result.tasks[0].errorMessage).toContain("HTTP 403");
    expect(result.tasks[0].errorMessage).toContain("auth");
    expect(result.tasks[0].errorMessage).toContain("Forbidden");
    expect(result.tasks[0].errorMessage).not.toContain("private-token");
    expect(result.tasks[0].errorMessage).not.toContain("sk-secret");
  });

  it("notifies when a task starts running", async () => {
    const updates: string[][] = [];
    const tasks = createTasksFromMultilinePrompts("one");
    await runBatchTasks({
      batchId: "batch-1",
      batchTitle: "Batch",
      batchCreatedAt: "2026-05-17T12:00:00.000Z",
      config: DEFAULT_CONFIG,
      tasks,
      executionConfig: { concurrency: 1, intervalSeconds: 0, maxRetries: 0 },
      referenceImages: [],
      generateImages: async () => [{ base64: "ok" }],
      saveBatchImage: async (input) => createSaveResult(input),
      onTaskUpdate: (nextTasks) => updates.push(nextTasks.map((task) => task.status)),
    });

    expect(updates[0]).toEqual(["running"]);
    expect(updates.at(-1)).toEqual(["succeeded"]);
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
