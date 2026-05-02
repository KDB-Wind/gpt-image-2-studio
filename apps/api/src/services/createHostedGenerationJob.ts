import type { PlatformRepository } from "@chat-to-image/platform-db";
import { canUseProvider, type ProviderCircuit } from "@chat-to-image/platform-core";

export type EnqueueGenerationJob = (jobId: string) => Promise<{ queueId: string }>;

export type CreateHostedGenerationJobInput = {
  repo: PlatformRepository;
  provider: ProviderCircuit;
  nowMs: number;
  userId: string;
  prompt: string;
  imageModel: string;
  enqueue: EnqueueGenerationJob;
};

export async function createHostedGenerationJob(input: CreateHostedGenerationJobInput) {
  const availability = canUseProvider(input.provider, input.nowMs, "user");
  if (!availability.allowed) {
    throw new Error("Hosted image service is temporarily paused. No credit was used.");
  }

  const balance = await input.repo.getCreditBalance(input.userId);
  if (balance < 1) {
    throw new Error("Insufficient credits.");
  }

  const job = await input.repo.createGenerationJob({
    userId: input.userId,
    mode: "hosted",
    prompt: input.prompt,
    imageModel: input.imageModel,
    status: "queued",
  });

  await input.enqueue(job.id);
  return job;
}
