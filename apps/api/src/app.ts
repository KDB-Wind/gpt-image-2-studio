import Fastify from "fastify";

import type { PlatformRepository } from "@chat-to-image/platform-db";
import { getEffectiveProviderCircuit, type ProviderCircuit } from "@chat-to-image/platform-core";
import type { EnqueueGenerationJob } from "./services/createHostedGenerationJob";
import { registerGenerationJobRoutes } from "./routes/generationJobs";

export type ApiAppDependencies = {
  repo: PlatformRepository;
  provider: ProviderCircuit;
  now: () => number;
  enqueue: EnqueueGenerationJob;
};

export function buildApiApp(deps: ApiAppDependencies) {
  const app = Fastify({ logger: false });

  app.get("/api/status", async () => {
    const provider = getEffectiveProviderCircuit(deps.provider, deps.now());
    return {
      providerState: provider.state,
      openUntilMs: provider.openUntilMs,
      imageModel: provider.imageModel,
    };
  });

  registerGenerationJobRoutes(app, deps);

  return app;
}
