import { Queue } from "bullmq";

import type { EnqueueGenerationJob } from "./createHostedGenerationJob";

export const GENERATION_QUEUE_NAME = "generation-jobs";
export const GENERATION_JOB_NAME = "generate-image";
export const DEFAULT_GENERATION_TIMEOUT_MS = 240000;

export type BullQueueLike = {
  add(
    name: string,
    data: { jobId: string; timeoutMs: number },
    options: { jobId: string; attempts: number; removeOnComplete: number; removeOnFail: number },
  ): Promise<{ id?: string | number | null }>;
};

export type GenerationQueueOptions = {
  timeoutMs?: number;
};

export function createGenerationQueueEnqueuer(
  queue: BullQueueLike,
  options: GenerationQueueOptions = {},
): EnqueueGenerationJob {
  const timeoutMs = options.timeoutMs ?? DEFAULT_GENERATION_TIMEOUT_MS;

  return async (jobId: string) => {
    const job = await queue.add(
      GENERATION_JOB_NAME,
      { jobId, timeoutMs },
      {
        jobId,
        attempts: 1,
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );

    return { queueId: String(job.id ?? jobId) };
  };
}

export function createBullMqGenerationQueue(input: { connection: unknown; timeoutMs?: number }) {
  const queue = new Queue(GENERATION_QUEUE_NAME, { connection: input.connection as never });
  return {
    queue,
    enqueue: createGenerationQueueEnqueuer(queue as unknown as BullQueueLike, { timeoutMs: input.timeoutMs }),
  };
}

export function createRedisConnectionFromEnv(env: NodeJS.ProcessEnv = process.env) {
  if (env.REDIS_URL) {
    return { url: env.REDIS_URL };
  }

  return {
    host: env.REDIS_HOST ?? "127.0.0.1",
    port: Number(env.REDIS_PORT ?? 6379),
  };
}
