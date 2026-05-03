import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { PlatformRepository } from "@chat-to-image/platform-db";
import {
  getProviderHealthSummary,
  runProviderHealthProbe,
  type ProviderHealthProbe,
} from "../services/providerHealthService";
import { requireAdminToken, type AdminRouteOptions } from "./adminAuth";

export type HealthRouteDependencies = AdminRouteOptions & {
  repo: PlatformRepository;
  now: () => number;
  health?: {
    probe?: ProviderHealthProbe;
  };
};

export function registerHealthRoutes(app: FastifyInstance, deps: HealthRouteDependencies) {
  app.get("/api/health/provider-models/:providerModelId", async (request) => {
    const params = z.object({ providerModelId: z.string().min(1) }).parse(request.params);
    return getProviderHealthSummary({
      repo: deps.repo,
      providerModelId: params.providerModelId,
    });
  });

  app.post("/api/admin/health/provider-models/:providerModelId/probe", async (request, reply) => {
    if (!requireAdminToken(request, reply, deps.admin?.token)) {
      return reply;
    }

    const params = z.object({ providerModelId: z.string().min(1) }).parse(request.params);
    if (!deps.health?.probe) {
      return reply.status(503).send({
        error: "Health probe is not configured in this runtime.",
      });
    }

    return runProviderHealthProbe({
      repo: deps.repo,
      providerModelId: params.providerModelId,
      nowMs: deps.now(),
      probe: deps.health.probe,
    });
  });
}
