import { describe, expect, it } from "vitest";

import { createGenerationQueueEnqueuer, GENERATION_QUEUE_NAME } from "./generationQueue";

describe("generation queue", () => {
  it("adds hosted generation jobs to a BullMQ-compatible queue", async () => {
    const calls: unknown[] = [];
    const enqueue = createGenerationQueueEnqueuer(
      {
        add: async (...args: unknown[]) => {
          calls.push(args);
          return { id: "bull-job-1" };
        },
      },
      { timeoutMs: 240000 },
    );

    await expect(enqueue("job-1")).resolves.toEqual({ queueId: "bull-job-1" });

    expect(GENERATION_QUEUE_NAME).toBe("generation-jobs");
    expect(calls).toEqual([
      [
        "generate-image",
        { jobId: "job-1", timeoutMs: 240000 },
        { jobId: "job-1", attempts: 1, removeOnComplete: 100, removeOnFail: 500 },
      ],
    ]);
  });
});
