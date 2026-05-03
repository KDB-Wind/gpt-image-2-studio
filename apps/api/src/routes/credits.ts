import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { PlatformRepository } from "@chat-to-image/platform-db";
import { addAdminCredits, getCreditOverview } from "../services/creditService";
import { requireAdminToken, type AdminRouteOptions } from "./adminAuth";
import { requireMatchingUserSession, type SessionAuthRouteDependencies } from "./sessionAuth";

export type CreditRouteDependencies = AdminRouteOptions & SessionAuthRouteDependencies & {
  repo: PlatformRepository;
};

const addCreditsSchema = z.object({
  adminUserId: z.string().min(1),
  amount: z.number().int().positive(),
  reason: z.string().min(1).max(500),
});

export function registerCreditRoutes(app: FastifyInstance, deps: CreditRouteDependencies) {
  app.get("/api/credits/:userId", async (request, reply) => {
    const params = z.object({ userId: z.string().min(1) }).safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: "Invalid credit overview request." });
    }

    const user = await requireMatchingUserSession(request, reply, deps, params.data.userId);
    if (!user) {
      return reply;
    }

    return getCreditOverview({ repo: deps.repo, userId: params.data.userId });
  });

  app.post("/api/admin/users/:userId/credits", async (request, reply) => {
    if (!requireAdminToken(request, reply, deps.admin?.token)) {
      return reply;
    }

    const params = z.object({ userId: z.string().min(1) }).parse(request.params);
    const parsed = addCreditsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid credit adjustment request.",
        details: parsed.error.flatten(),
      });
    }

    return addAdminCredits({
      repo: deps.repo,
      adminUserId: parsed.data.adminUserId,
      userId: params.userId,
      amount: parsed.data.amount,
      reason: parsed.data.reason,
    });
  });
}
