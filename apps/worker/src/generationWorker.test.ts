import { describe, expect, it } from "vitest";

import { createGenerationWorker, runWithTimeout } from "./generationWorker";

describe("generation worker", () => {
  it("creates a BullMQ worker with configured concurrency and job timeout", async () => {
    const created: Array<{ name: string; options: unknown; processor: (job: { data: unknown }) => Promise<void> }> = [];
    const handled: string[] = [];

    createGenerationWorker({
      connection: { host: "127.0.0.1", port: 6379 },
      concurrency: 2,
      timeoutMs: 240000,
      processor: async ({ jobId }) => {
        handled.push(jobId);
      },
      WorkerCtor: class FakeWorker {
        constructor(name: string, processor: (job: { data: unknown }) => Promise<void>, options: unknown) {
          created.push({ name, processor, options });
        }
      },
    });

    expect(created[0].name).toBe("generation-jobs");
    expect(created[0].options).toMatchObject({ concurrency: 2, connection: { host: "127.0.0.1", port: 6379 } });

    await created[0].processor({ data: { jobId: "job-1", timeoutMs: 240000 } });

    expect(handled).toEqual(["job-1"]);
  });

  it("rejects work that exceeds the configured timeout", async () => {
    await expect(
      runWithTimeout(
        () => new Promise((resolve) => setTimeout(resolve, 50)),
        1,
      ),
    ).rejects.toThrow("Generation job timed out after 1ms");
  });
});
