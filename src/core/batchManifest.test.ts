import { describe, expect, it } from "vitest";
import { DEFAULT_BATCH_EXECUTION_CONFIG, type BatchTask } from "./batchTypes";
import {
  buildBatchDirectoryName,
  buildBatchImageFileName,
  buildBatchManifest,
  summarizeBatchTasks,
} from "./batchManifest";
import { DEFAULT_CONFIG } from "./config";

const baseTask: BatchTask = {
  id: "task-001",
  index: 0,
  title: "Argentina Poster",
  prompt: "Create an Argentina poster.",
  status: "succeeded",
  attemptCount: 1,
  errorMessage: "",
  failureCategory: null,
  outputPath: "outputs/batch/001-argentina-poster.png",
  previewUrl: "blob:test",
  durationMs: 1000,
  startedAt: "2026-05-17T12:00:00.000Z",
  completedAt: "2026-05-17T12:00:01.000Z",
};

describe("batchManifest", () => {
  it("builds a stable batch directory name", () => {
    expect(buildBatchDirectoryName("2026-05-17T12:30:12.000Z", "World Cup Posters")).toBe(
      "2026-05-17-123012-batch-world-cup-posters",
    );
  });

  it("builds indexed image filenames", () => {
    expect(buildBatchImageFileName(baseTask, "png", [])).toBe("001-argentina-poster.png");
    expect(buildBatchImageFileName(baseTask, "jpeg", ["001-argentina-poster.jpg"])).toBe(
      "001-argentina-poster-2.jpg",
    );
  });

  it("summarizes task statuses", () => {
    expect(summarizeBatchTasks([baseTask, { ...baseTask, id: "task-002", status: "failed" }])).toMatchObject({
      total: 2,
      succeeded: 1,
      failed: 1,
    });
  });

  it("builds a manifest with image config snapshot", () => {
    const manifest = buildBatchManifest({
      id: "batch-1",
      title: "World Cup Posters",
      source: "custom-prompts",
      createdAt: "2026-05-17T12:00:00.000Z",
      startedAt: "2026-05-17T12:00:10.000Z",
      completedAt: "2026-05-17T12:03:00.000Z",
      executionConfig: DEFAULT_BATCH_EXECUTION_CONFIG,
      config: DEFAULT_CONFIG,
      tasks: [baseTask],
    });

    expect(manifest.imageConfig).toEqual({
      model: DEFAULT_CONFIG.imageModel,
      size: DEFAULT_CONFIG.defaultSize,
      quality: DEFAULT_CONFIG.defaultQuality,
      format: DEFAULT_CONFIG.defaultFormat,
      outputCompression: DEFAULT_CONFIG.defaultCompression,
    });
    expect(manifest.tasks[0]).not.toHaveProperty("previewUrl");
  });
});
