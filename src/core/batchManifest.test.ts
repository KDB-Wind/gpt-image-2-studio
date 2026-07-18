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

  it("uses the planner suggested name before falling back to the task title", () => {
    expect(buildBatchImageFileName({ ...baseTask, suggestedName: "france-2026-poster" }, "png", [])).toBe(
      "001-france-2026-poster.png",
    );
  });

  it("summarizes task statuses", () => {
    expect(summarizeBatchTasks([
      { ...baseTask, historyDurability: "memory-only" },
      { ...baseTask, id: "task-002", status: "failed" },
    ])).toMatchObject({
      total: 2,
      succeeded: 1,
      failed: 1,
      memoryOnlyHistory: 1,
    });
  });

  it("builds a manifest with active profile image config snapshot", () => {
    const config = {
      ...DEFAULT_CONFIG,
      imageModel: "stale-top-level-model",
      activeProviderProfileId: "provider-active",
      providerProfiles: [{
        ...DEFAULT_CONFIG.providerProfiles[0],
        id: "provider-active",
        imageModel: "active-image-model",
      }],
    };
    const manifest = buildBatchManifest({
      id: "batch-1",
      title: "World Cup Posters",
      source: "custom-prompts",
      createdAt: "2026-05-17T12:00:00.000Z",
      startedAt: "2026-05-17T12:00:10.000Z",
      completedAt: "2026-05-17T12:03:00.000Z",
      executionConfig: DEFAULT_BATCH_EXECUTION_CONFIG,
      config,
      tasks: [baseTask],
    });

    expect(manifest.imageConfig).toEqual({
      model: "active-image-model",
      size: DEFAULT_CONFIG.defaultSize,
      quality: DEFAULT_CONFIG.defaultQuality,
      format: DEFAULT_CONFIG.defaultFormat,
      outputCompression: DEFAULT_CONFIG.defaultCompression,
    });
    expect(manifest.tasks[0]).not.toHaveProperty("previewUrl");
  });

  it("keeps successful task save facts while omitting its preview URL", () => {
    const manifest = buildBatchManifest({
      id: "batch-1",
      title: "World Cup Posters",
      source: "custom-prompts",
      createdAt: "2026-05-17T12:00:00.000Z",
      startedAt: "2026-05-17T12:00:10.000Z",
      completedAt: "2026-05-17T12:03:00.000Z",
      executionConfig: DEFAULT_BATCH_EXECUTION_CONFIG,
      config: DEFAULT_CONFIG,
      tasks: [
        {
          ...baseTask,
          saveMode: "browser-download",
          saveFallbackReason: "permission denied",
          historyDurability: "memory-only",
          historyWarning: "History is only in this open app instance.",
        },
      ],
    });

    expect(manifest.tasks[0]).toMatchObject({
      saveMode: "browser-download",
      saveFallbackReason: "permission denied",
      historyDurability: "memory-only",
      historyWarning: "History is only in this open app instance.",
    });
    expect(manifest.tasks[0]).not.toHaveProperty("previewUrl");
  });

  it("sanitizes task failures and fallback reasons before manifest serialization", () => {
    const manifest = buildBatchManifest({
      id: "batch-1",
      title: "World Cup Posters",
      source: "custom-prompts",
      createdAt: "2026-05-17T12:00:00.000Z",
      startedAt: "2026-05-17T12:00:10.000Z",
      completedAt: "2026-05-17T12:03:00.000Z",
      executionConfig: DEFAULT_BATCH_EXECUTION_CONFIG,
      config: DEFAULT_CONFIG,
      tasks: [
        {
          ...baseTask,
          status: "failed",
          errorMessage:
            'HTTP 403 provider error: {"error":{"message":"Forbidden","token":"private-token","api_key":"sk-secret"}}',
          saveMode: "browser-download",
          saveFallbackReason:
            "Authorization: Bearer sk-secret-secret failed at https://provider.example/file.png?signature=secret",
        },
      ],
    });

    const serialized = JSON.stringify(manifest);
    expect(manifest.tasks[0].errorMessage).toContain("HTTP 403");
    expect(manifest.tasks[0].errorMessage).toContain("Forbidden");
    expect(manifest.tasks[0].saveFallbackReason).toContain("[redacted");
    expect(serialized).not.toContain("private-token");
    expect(serialized).not.toContain("sk-secret");
    expect(serialized).not.toContain("provider.example");
  });
});
