import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { createHostedGenerationJob, type EnqueueGenerationJob } from "../services/createHostedGenerationJob";
import type { PlatformRepository } from "@chat-to-image/platform-db";
import type { ProviderCircuit } from "@chat-to-image/platform-core";

export type GenerationJobRouteDependencies = {
  repo: PlatformRepository;
  provider: ProviderCircuit;
  now: () => number;
  enqueue: EnqueueGenerationJob;
};

const createJobSchema = z.object({
  userId: z.string().min(1),
  prompt: z.string().min(1).max(8000),
  imageModel: z.string().min(1),
});

export function registerGenerationJobRoutes(app: FastifyInstance, deps: GenerationJobRouteDependencies) {
  app.post("/api/generation-jobs", async (request, reply) => {
    const parsed = createJobSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid generation request.",
        details: parsed.error.flatten(),
      });
    }

    return createHostedGenerationJob({
      repo: deps.repo,
      provider: deps.provider,
      nowMs: deps.now(),
      userId: parsed.data.userId,
      prompt: parsed.data.prompt,
      imageModel: parsed.data.imageModel,
      enqueue: deps.enqueue,
    });
  });
}
