import { describe, expect, it } from "vitest";
import {
  DEFAULT_BATCH_EXECUTION_CONFIG,
  clampBatchExecutionConfig,
  createBatchId,
  isTerminalBatchTaskStatus,
} from "./batchTypes";
import type { BatchImageSaveInput, BatchManifestTask, BatchTask } from "./batchTypes";

describe("batchTypes", () => {
  it("stores only a non-sensitive provider snapshot on tasks and save inputs", () => {
    const snapshot = {
      providerProfileId: "profile-a",
      providerProfileName: "Profile A",
      imageModel: "image-a",
      imageResponseMode: "force-base64" as const,
    };
    const task = { providerProfileSnapshot: snapshot } as Pick<BatchTask, "providerProfileSnapshot">;
    const input = { providerProfileSnapshot: snapshot } as Pick<BatchImageSaveInput, "providerProfileSnapshot">;
    const manifest = { providerProfileSnapshot: snapshot } as Pick<BatchManifestTask, "providerProfileSnapshot">;

    expect(task.providerProfileSnapshot).toEqual(snapshot);
    expect(input.providerProfileSnapshot).toEqual(snapshot);
    expect(manifest.providerProfileSnapshot).toEqual(snapshot);
    expect(JSON.stringify(snapshot)).not.toMatch(/apiKey|Authorization|signature|url/i);
  });
  it("uses conservative execution defaults", () => {
    expect(DEFAULT_BATCH_EXECUTION_CONFIG).toEqual({
      concurrency: 1,
      intervalSeconds: 20,
      maxRetries: 1,
    });
  });

  it("clamps unsafe execution values", () => {
    expect(clampBatchExecutionConfig({ concurrency: 42, intervalSeconds: -5, maxRetries: 8 })).toEqual({
      concurrency: 10,
      intervalSeconds: 0,
      maxRetries: 3,
    });
  });

  it("identifies terminal task statuses", () => {
    expect(isTerminalBatchTaskStatus("succeeded")).toBe(true);
    expect(isTerminalBatchTaskStatus("failed")).toBe(true);
    expect(isTerminalBatchTaskStatus("skipped")).toBe(true);
    expect(isTerminalBatchTaskStatus("pending")).toBe(false);
    expect(isTerminalBatchTaskStatus("running")).toBe(false);
  });

  it("creates ids with the batch prefix", () => {
    expect(createBatchId("2026-05-17T12:00:00.000Z")).toBe("batch-20260517-120000");
  });
});
