import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { PlatformRepository, ProviderApiKey, ProviderModel } from "@chat-to-image/platform-db";
import { requireAdminToken, type AdminRouteOptions } from "./adminAuth";

export type AdminManagementRouteDependencies = AdminRouteOptions & {
  repo: PlatformRepository;
};

const listUsersQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional(),
});

const updateUserSchema = z.object({
  adminUserId: z.string().min(1),
  disabled: z.boolean(),
});

const providerKeyStateSchema = z.enum(["healthy", "cooldown", "disabled"]);

const updateProviderApiKeySchema = z.object({
  adminUserId: z.string().min(1),
  enabled: z.boolean().optional(),
  state: providerKeyStateSchema.optional(),
  maxInFlight: z.number().int().positive().max(20).optional(),
});

export function registerAdminManagementRoutes(app: FastifyInstance, deps: AdminManagementRouteDependencies) {
  app.get("/api/admin/users", async (request, reply) => {
    if (!requireAdminToken(request, reply, deps.admin?.token)) {
      return reply;
    }

    const parsed = listUsersQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid admin users query.", details: parsed.error.flatten() });
    }

    const users = await deps.repo.listUsers(parsed.data.limit ?? 50);
    const summaries = await Promise.all(
      users.map(async (user) => ({
        ...user,
        balance: await deps.repo.getCreditBalance(user.id),
      })),
    );
    return { users: summaries };
  });

  app.patch("/api/admin/users/:userId", async (request, reply) => {
    if (!requireAdminToken(request, reply, deps.admin?.token)) {
      return reply;
    }

    const params = z.object({ userId: z.string().min(1) }).safeParse(request.params);
    const parsed = updateUserSchema.safeParse(request.body);
    if (!params.success || !parsed.success) {
      return reply.status(400).send({ error: "Invalid admin user update request." });
    }

    try {
      const user = await deps.repo.setUserDisabled(params.data.userId, parsed.data.disabled);
      await deps.repo.recordAdminAuditLog({
        adminUserId: parsed.data.adminUserId,
        action: parsed.data.disabled ? "user.disable" : "user.enable",
        targetType: "user",
        targetId: user.id,
        detail: { disabled: user.disabled },
      });
      return user;
    } catch (error) {
      return reply.status(404).send({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/admin/provider-models", async (request, reply) => {
    if (!requireAdminToken(request, reply, deps.admin?.token)) {
      return reply;
    }

    const models = await deps.repo.listProviderModels();
    const summaries = await Promise.all(models.map((model) => summarizeProviderModel(deps.repo, model)));
    return { models: summaries };
  });

  app.patch("/api/admin/provider-api-keys/:apiKeyId", async (request, reply) => {
    if (!requireAdminToken(request, reply, deps.admin?.token)) {
      return reply;
    }

    const params = z.object({ apiKeyId: z.string().min(1) }).safeParse(request.params);
    const parsed = updateProviderApiKeySchema.safeParse(request.body);
    if (!params.success || !parsed.success) {
      return reply.status(400).send({ error: "Invalid provider API key update request." });
    }

    const { adminUserId, ...patch } = parsed.data;
    if (patch.enabled === undefined && patch.state === undefined && patch.maxInFlight === undefined) {
      return reply.status(400).send({ error: "No provider API key fields were provided." });
    }

    try {
      const key = await deps.repo.updateProviderApiKey(params.data.apiKeyId, patch);
      await deps.repo.recordAdminAuditLog({
        adminUserId,
        action: "provider_api_key.update",
        targetType: "provider_api_key",
        targetId: key.id,
        detail: patch,
      });
      return redactProviderApiKey(key);
    } catch (error) {
      return reply.status(404).send({ error: getErrorMessage(error) });
    }
  });
}

async function summarizeProviderModel(repo: PlatformRepository, model: ProviderModel) {
  const [apiKeys, healthEvents] = await Promise.all([
    repo.listProviderApiKeys(model.id),
    repo.listProviderHealthEvents(model.id, 5),
  ]);
  return {
    ...model,
    apiKeys: apiKeys.map(redactProviderApiKey),
    healthEvents,
  };
}

function redactProviderApiKey(key: ProviderApiKey) {
  const { keyCiphertext: _keyCiphertext, ...safeKey } = key;
  return safeKey;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Admin management request failed.";
}
