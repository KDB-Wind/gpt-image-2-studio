import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { PlatformRepository } from "@chat-to-image/platform-db";
import {
  disableUser,
  issueEmailVerificationCode,
  verifyEmailCodeAndCreateSession,
  type AuthServiceOptions,
} from "../services/authService";
import { requireAdminToken, type AdminRouteOptions } from "./adminAuth";

export type AuthRouteDependencies = AdminRouteOptions & {
  repo: PlatformRepository;
  now: () => number;
  auth?: AuthServiceOptions;
};

const requestCodeSchema = z.object({
  email: z.string().email(),
});

const verifySchema = z.object({
  email: z.string().email(),
  code: z.string().min(4).max(12),
});

const disableUserSchema = z.object({
  adminUserId: z.string().min(1),
  disabled: z.boolean(),
});

export function registerAuthRoutes(app: FastifyInstance, deps: AuthRouteDependencies) {
  app.post("/api/auth/request-code", async (request, reply) => {
    const parsed = requestCodeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid email.", details: parsed.error.flatten() });
    }

    try {
      const result = await issueEmailVerificationCode({
        ...deps.auth,
        repo: deps.repo,
        email: parsed.data.email,
        ipAddress: request.ip,
        now: new Date(deps.now()),
      });
      return reply.send(result);
    } catch (error) {
      return reply.status(400).send({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/auth/verify", async (request, reply) => {
    const parsed = verifySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid verification request.", details: parsed.error.flatten() });
    }

    try {
      const result = await verifyEmailCodeAndCreateSession({
        ...deps.auth,
        repo: deps.repo,
        email: parsed.data.email,
        code: parsed.data.code,
        now: new Date(deps.now()),
      });
      return reply.send(result);
    } catch (error) {
      return reply.status(400).send({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/users/:userId/disabled", async (request, reply) => {
    if (!requireAdminToken(request, reply, deps.admin?.token)) {
      return reply;
    }

    const params = z.object({ userId: z.string().min(1) }).safeParse(request.params);
    const body = disableUserSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.status(400).send({ error: "Invalid admin user update request." });
    }

    try {
      const result = await disableUser({
        repo: deps.repo,
        adminUserId: body.data.adminUserId,
        userId: params.data.userId,
        disabled: body.data.disabled,
      });
      return reply.send(result);
    } catch (error) {
      return reply.status(400).send({ error: getErrorMessage(error) });
    }
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed.";
}
