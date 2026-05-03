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
  app.get("/api/users/:userId/generation-jobs", async (request, reply) => {
    const params = z.object({ userId: z.string().min(1) }).safeParse(request.params);
    const query = z.object({ limit: z.coerce.number().int().min(1).max(100).optional() }).safeParse(request.query);
    if (!params.success || !query.success) {
      return reply.status(400).send({ error: "Invalid generation job history request." });
    }

    const jobs = await deps.repo.listUserGenerationJobs(params.data.userId, query.data.limit ?? 50);
    return { jobs };
  });

  app.get("/api/generation-jobs/:jobId", async (request, reply) => {
    const params = z.object({ jobId: z.string().min(1) }).safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: "Invalid generation job request." });
    }

    const job = await deps.repo.getGenerationJob(params.data.jobId);
    if (!job) {
      return reply.status(404).send({ error: "Generation job not found." });
    }

    const results = await deps.repo.getGenerationResults(job.id);
    return { job, results };
  });

  app.post("/api/generation-jobs", async (request, reply) => {
    const parsed = createJobSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid generation request.",
        details: parsed.error.flatten(),
      });
    }

    try {
      return await createHostedGenerationJob({
        repo: deps.repo,
        provider: deps.provider,
        nowMs: deps.now(),
        userId: parsed.data.userId,
        prompt: parsed.data.prompt,
        imageModel: parsed.data.imageModel,
        enqueue: deps.enqueue,
      });
    } catch (error) {
      const message = getErrorMessage(error);
      return reply.status(getCreateJobErrorStatus(message)).send({ error: message });
    }
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Generation job request failed.";
}

function getCreateJobErrorStatus(message: string): number {
  if (message.includes("temporarily paused") || message.includes("not configured")) {
    return 503;
  }

  if (message.includes("Insufficient credits")) {
    return 402;
  }

  if (message.includes("not allowed")) {
    return 403;
  }

  return 400;
}
