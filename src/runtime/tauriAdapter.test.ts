import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_BATCH_EXECUTION_CONFIG, type BatchManifest } from "../core/batchTypes";
import { DEFAULT_CONFIG } from "../core/config";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
  invoke: invokeMock,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openPath: vi.fn(),
}));

import { tauriAdapter } from "./tauriAdapter";

describe("tauriAdapter output directory state", () => {
  const config = { ...DEFAULT_CONFIG, outputDirectory: "outputs" };

  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "load_config") {
        return config;
      }

      if (command === "get_output_directory_state") {
        return { status: "permission-required", name: "outputs" };
      }

      throw new Error(`Unexpected command: ${command}`);
    });
  });

  it("does not report ready before the native directory test succeeds", async () => {
    await expect(tauriAdapter.getOutputDirectoryState()).resolves.toEqual({
      status: "permission-required",
      name: "outputs",
    });

    expect(invokeMock).toHaveBeenCalledWith("get_output_directory_state");
  });

  it("runs the native write/read test and preserves the returned test timestamp", async () => {
    const testedAt = "2026-07-11T04:00:00+00:00";
    invokeMock.mockImplementation(async (command: string, payload?: unknown) => {
      if (command === "load_config") {
        return config;
      }

      if (command === "test_output_directory") {
        expect(payload).toEqual({ outputDirectory: "outputs" });
        return {
          ok: true,
          fileName: ".chat-to-image-output-directory-test",
          bytes: 48,
          lastTestedAt: testedAt,
        };
      }

      if (command === "get_output_directory_state") {
        return { status: "ready", name: "outputs", lastTestedAt: testedAt };
      }

      throw new Error(`Unexpected command: ${command}`);
    });

    await expect(tauriAdapter.testOutputDirectory()).resolves.toMatchObject({
      ok: true,
      lastTestedAt: testedAt,
    });
    await expect(tauriAdapter.getOutputDirectoryState()).resolves.toEqual({
      status: "ready",
      name: "outputs",
      lastTestedAt: testedAt,
    });

    expect(invokeMock).toHaveBeenCalledWith("test_output_directory", { outputDirectory: "outputs" });
  });

  it("returns a failed test instead of inventing a ready timestamp when native access fails", async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "load_config") {
        return config;
      }

      if (command === "test_output_directory") {
        throw new Error("permission denied");
      }

      if (command === "get_output_directory_state") {
        return { status: "permission-required", name: "outputs" };
      }

      throw new Error(`Unexpected command: ${command}`);
    });

    await expect(tauriAdapter.testOutputDirectory()).resolves.toEqual({
      ok: false,
      message: "permission denied",
    });
    await expect(tauriAdapter.getOutputDirectoryState()).resolves.toEqual({
      status: "permission-required",
      name: "outputs",
    });
  });

  it("sanitizes batch manifest errors before crossing the native persistence boundary", async () => {
    const secret = ["sk", "abcdefghijklmnopqrstuvwx"].join("-");
    const manifest: BatchManifest = {
      id: "batch-1",
      title: "Batch",
      source: "same-prompt",
      createdAt: "2026-07-11T00:00:00.000Z",
      startedAt: "2026-07-11T00:00:00.000Z",
      completedAt: "2026-07-11T00:01:00.000Z",
      executionConfig: DEFAULT_BATCH_EXECUTION_CONFIG,
      imageConfig: {
        model: "image-model",
        size: "1024x1024",
        quality: "auto",
        format: "png",
        outputCompression: 100,
      },
      summary: { total: 1, pending: 0, running: 0, succeeded: 0, failed: 1, skipped: 0, durationMs: 60_000 },
      tasks: [
        {
          id: "task-1",
          index: 0,
          title: "Task",
          prompt: "Prompt",
          status: "failed",
          attemptCount: 1,
          errorMessage: `HTTP 403 Authorization: Bearer ${secret}`,
          failureCategory: "auth",
          outputPath: "",
          durationMs: 100,
          startedAt: "2026-07-11T00:00:00.000Z",
          completedAt: "2026-07-11T00:00:00.100Z",
        },
      ],
    };
    invokeMock.mockImplementation(async (command: string, payload?: unknown) => {
      if (command === "save_batch_manifest") {
        const serialized = JSON.stringify(payload);
        expect(serialized).not.toContain(secret);
        expect(serialized).toContain("[redacted]");
        return "manifest.json";
      }

      throw new Error(`Unexpected command: ${command}`);
    });

    await expect(tauriAdapter.saveBatchManifest(manifest)).resolves.toBe("manifest.json");
  });
});
