import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { PlatformRepository } from "@chat-to-image/platform-db";
import {
  getHealthProbeSchedule,
  getProviderHealthSummary,
  runProviderHealthProbe,
  setHealthProbeSchedule,
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

const probeScheduleSchema = z.object({
  dayStartHourUtc: z.number().int().min(0).max(23),
  nightStartHourUtc: z.number().int().min(0).max(23),
  dayIntervalMinutes: z.number().int().positive().max(1440),
  nightIntervalMinutes: z.number().int().positive().max(1440),
});

export function registerHealthRoutes(app: FastifyInstance, deps: HealthRouteDependencies) {
  app.get("/api/admin/health/probe-schedule", async (request, reply) => {
    if (!requireAdminToken(request, reply, deps.admin?.token)) {
      return reply;
    }

    return getHealthProbeSchedule({ repo: deps.repo });
  });

  app.put("/api/admin/health/probe-schedule", async (request, reply) => {
    if (!requireAdminToken(request, reply, deps.admin?.token)) {
      return reply;
    }

    const parsed = probeScheduleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid health probe schedule.", details: parsed.error.flatten() });
    }

    return setHealthProbeSchedule({ repo: deps.repo, schedule: parsed.data });
  });

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
