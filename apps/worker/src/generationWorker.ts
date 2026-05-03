import { Worker } from "bullmq";

export const GENERATION_QUEUE_NAME = "generation-jobs";
export const DEFAULT_GENERATION_TIMEOUT_MS = 240000;

export type GenerationWorkerProcessor = (input: { jobId: string }) => Promise<void>;

export type WorkerCtor = new (
  name: string,
  processor: (job: { data: unknown }) => Promise<void>,
  options: { connection: unknown; concurrency: number },
) => unknown;

export type CreateGenerationWorkerInput = {
  connection: unknown;
  concurrency?: number;
  timeoutMs?: number;
  processor: GenerationWorkerProcessor;
  WorkerCtor?: WorkerCtor;
};

export function createGenerationWorker(input: CreateGenerationWorkerInput) {
  const WorkerImplementation = input.WorkerCtor ?? (Worker as unknown as WorkerCtor);
  const timeoutMs = input.timeoutMs ?? DEFAULT_GENERATION_TIMEOUT_MS;

  return new WorkerImplementation(
    GENERATION_QUEUE_NAME,
    async (job) => {
      const data = parseGenerationJobData(job.data);
      await runWithTimeout(() => input.processor({ jobId: data.jobId }), data.timeoutMs ?? timeoutMs);
    },
    {
      connection: input.connection,
      concurrency: input.concurrency ?? 2,
    },
  );
}

export async function runWithTimeout<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Generation job timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function parseGenerationJobData(data: unknown): { jobId: string; timeoutMs?: number } {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid generation job data.");
  }

  const record = data as Record<string, unknown>;
  if (typeof record.jobId !== "string" || record.jobId.length === 0) {
    throw new Error("Generation job data is missing jobId.");
  }

  return {
    jobId: record.jobId,
    timeoutMs: typeof record.timeoutMs === "number" ? record.timeoutMs : undefined,
  };
}
