import Fastify from "fastify";

import type { PlatformRepository, ProviderModel } from "@chat-to-image/platform-db";
import { getEffectiveProviderCircuit, type ProviderCircuit } from "@chat-to-image/platform-core";
import type { EnqueueGenerationJob } from "./services/createHostedGenerationJob";
import { registerGenerationJobRoutes } from "./routes/generationJobs";
import { registerAuthRoutes } from "./routes/auth";
import type { AuthServiceOptions } from "./services/authService";
import { registerCreditRoutes } from "./routes/credits";
import { registerHealthRoutes } from "./routes/health";
import type { ProviderHealthProbe } from "./services/providerHealthService";
import { registerPromptTemplateRoutes } from "./routes/promptTemplates";
import type { AdminRouteOptions } from "./routes/adminAuth";
import { registerPaymentRoutes } from "./routes/payments";
import { registerAdminManagementRoutes } from "./routes/adminManagement";

export type ApiAppDependencies = {
  repo: PlatformRepository;
  provider: ProviderCircuit;
  now: () => number;
  enqueue: EnqueueGenerationJob;
  admin?: AdminRouteOptions["admin"];
  auth?: AuthServiceOptions;
  health?: {
    probe?: ProviderHealthProbe;
  };
};

export function buildApiApp(deps: ApiAppDependencies) {
  const app = Fastify({ logger: false });

  app.get("/api/status", async () => {
    const provider = getEffectiveProviderCircuit(await getProviderCircuit(deps), deps.now());
    return {
      providerState: provider.state,
      openUntilMs: provider.openUntilMs,
      imageModel: provider.imageModel,
    };
  });

  registerGenerationJobRoutes(app, deps);
  registerAuthRoutes(app, deps);
  registerCreditRoutes(app, deps);
  registerPaymentRoutes(app, deps);
  registerHealthRoutes(app, deps);
  registerPromptTemplateRoutes(app, deps);
  registerAdminManagementRoutes(app, deps);

  return app;
}

async function getProviderCircuit(deps: ApiAppDependencies): Promise<ProviderCircuit> {
  const persisted = await deps.repo.getProviderModelByKey(deps.provider.baseUrl, deps.provider.imageModel);
  return persisted ? providerModelToCircuit(persisted) : deps.provider;
}

function providerModelToCircuit(model: ProviderModel): ProviderCircuit {
  return {
    providerId: model.providerId,
    baseUrl: model.baseUrl,
    imageModel: model.imageModel,
    state: model.state === "open" || model.state === "half_open" ? model.state : "closed",
    openedAtMs: model.openedAt?.getTime() ?? null,
    openUntilMs: model.openUntil?.getTime() ?? null,
    cooldownMs: model.cooldownMs,
    halfOpenProbeInFlight: false,
    consecutiveCostRiskFailures: 0,
    lastFailureReason: model.lastFailureReason,
  };
}
