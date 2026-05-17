import { describe, expect, it } from "vitest";
import {
  DEFAULT_BATCH_EXECUTION_CONFIG,
  clampBatchExecutionConfig,
  createBatchId,
  isTerminalBatchTaskStatus,
} from "./batchTypes";

describe("batchTypes", () => {
  it("uses conservative execution defaults", () => {
    expect(DEFAULT_BATCH_EXECUTION_CONFIG).toEqual({
      concurrency: 1,
      intervalSeconds: 20,
      maxRetries: 1,
    });
  });

  it("clamps unsafe execution values", () => {
    expect(clampBatchExecutionConfig({ concurrency: 9, intervalSeconds: -5, maxRetries: 8 })).toEqual({
      concurrency: 3,
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
