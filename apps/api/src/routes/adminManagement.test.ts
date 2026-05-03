import { describe, expect, it } from "vitest";

import { createProviderCircuit } from "@chat-to-image/platform-core";
import { createInMemoryPlatformRepository } from "@chat-to-image/platform-db/in-memory";
import { buildApiApp } from "../app";

const nowMs = Date.UTC(2026, 4, 2, 12, 0, 0);
const adminHeaders = { "x-admin-token": "admin-secret" };

describe("admin management routes", () => {
  it("lists users with balances and lets admins disable a user", async () => {
    const repo = createInMemoryPlatformRepository();
    const user = await repo.createUser({ email: "demo@example.com" });
    await repo.addCreditLedgerEvent({
      userId: user.id,
      eventType: "admin_adjustment",
      amount: 3,
      reason: "manual grant",
    });
    const app = buildApp(repo);

    const list = await app.inject({
      method: "GET",
      url: "/api/admin/users",
      headers: adminHeaders,
    });
    const disable = await app.inject({
      method: "PATCH",
      url: `/api/admin/users/${user.id}`,
      headers: adminHeaders,
      payload: { adminUserId: "admin", disabled: true },
    });

    expect(list.statusCode).toBe(200);
    expect(list.json().users).toMatchObject([{ id: user.id, email: "demo@example.com", balance: 3 }]);
    expect(disable.statusCode).toBe(200);
    expect(disable.json()).toMatchObject({ id: user.id, disabled: true });
  });

  it("lists provider models with redacted keys and lets admins update key status", async () => {
    const repo = createInMemoryPlatformRepository();
    const model = await repo.upsertProviderModel({
      providerId: "ruoli",
      baseUrl: "https://ruoli.dev/v1",
      imageModel: "gpt-image-2",
      state: "closed",
      cooldownMs: 300000,
    });
    const key = await repo.createProviderApiKey({
      providerModelId: model.id,
      label: "Key 1",
      keyCiphertext: "env:secret-key",
      maxInFlight: 1,
    });
    await repo.recordProviderHealthEvent({
      providerModelId: model.id,
      apiKeyId: key.id,
      status: "success",
      latencyMs: 120000,
      imageBytes: 600000,
      message: "probe ok",
    });
    const app = buildApp(repo);

    const list = await app.inject({
      method: "GET",
      url: "/api/admin/provider-models",
      headers: adminHeaders,
    });
    const update = await app.inject({
      method: "PATCH",
      url: `/api/admin/provider-api-keys/${key.id}`,
      headers: adminHeaders,
      payload: {
        adminUserId: "admin",
        enabled: false,
        state: "disabled",
        maxInFlight: 2,
      },
    });

    expect(list.statusCode).toBe(200);
    expect(list.json().models[0]).toMatchObject({
      id: model.id,
      apiKeys: [{ id: key.id, label: "Key 1", enabled: true, state: "healthy", maxInFlight: 1 }],
      healthEvents: [{ status: "success", imageBytes: 600000 }],
    });
    expect(JSON.stringify(list.json())).not.toContain("secret-key");
    expect(update.statusCode).toBe(200);
    expect(update.json()).toMatchObject({ id: key.id, enabled: false, state: "disabled", maxInFlight: 2 });
  });

  it("requires the admin token", async () => {
    const app = buildApp(createInMemoryPlatformRepository());

    const response = await app.inject({ method: "GET", url: "/api/admin/users" });

    expect(response.statusCode).toBe(401);
  });
});

function buildApp(repo: ReturnType<typeof createInMemoryPlatformRepository>) {
  return buildApiApp({
    repo,
    provider: createProviderCircuit({
      providerId: "ruoli",
      baseUrl: "https://ruoli.dev/v1",
      imageModel: "gpt-image-2",
      nowMs,
    }),
    now: () => nowMs,
    enqueue: async (jobId) => ({ queueId: `queue-${jobId}` }),
    admin: { token: "admin-secret" },
  });
}
