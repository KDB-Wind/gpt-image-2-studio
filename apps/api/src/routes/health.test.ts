import { describe, expect, it } from "vitest";

import { createInMemoryPlatformRepository } from "@chat-to-image/platform-db/in-memory";
import { createProviderCircuit } from "@chat-to-image/platform-core";
import { buildApiApp } from "../app";

const nowMs = Date.UTC(2026, 4, 2, 12, 0, 0);

describe("health routes", () => {
  it("rejects admin probes when the admin token is missing", async () => {
    const repo = createInMemoryPlatformRepository();
    const model = await repo.upsertProviderModel({
      providerId: "ruoli",
      baseUrl: "https://ruoli.dev/v1",
      imageModel: "gpt-image-2",
      state: "closed",
      cooldownMs: 300000,
    });
    await repo.createProviderApiKey({
      providerModelId: model.id,
      label: "Key 1",
      keyCiphertext: "encrypted-key",
      maxInFlight: 1,
    });
    const app = buildApiApp({
      repo,
      provider: createProviderCircuit({
        providerId: "ruoli",
        baseUrl: "https://ruoli.dev/v1",
        imageModel: "gpt-image-2",
        nowMs,
      }),
      now: () => nowMs,
      enqueue: async (jobId) => ({ queueId: `queue-${jobId}` }),
      health: {
        probe: async () => ({ latencyMs: 120000, imageBytes: 640000, message: "probe ok" }),
      },
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/admin/health/provider-models/${model.id}/probe`,
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: "Admin API token is not configured." });
  });

  it("runs a one-key admin probe and returns provider health status", async () => {
    const repo = createInMemoryPlatformRepository();
    const model = await repo.upsertProviderModel({
      providerId: "ruoli",
      baseUrl: "https://ruoli.dev/v1",
      imageModel: "gpt-image-2",
      state: "closed",
      cooldownMs: 300000,
    });
    await repo.createProviderApiKey({
      providerModelId: model.id,
      label: "Key 1",
      keyCiphertext: "encrypted-key",
      maxInFlight: 1,
    });
    const app = buildApiApp({
      repo,
      provider: createProviderCircuit({
        providerId: "ruoli",
        baseUrl: "https://ruoli.dev/v1",
        imageModel: "gpt-image-2",
        nowMs,
      }),
      now: () => nowMs,
      enqueue: async (jobId) => ({ queueId: `queue-${jobId}` }),
      admin: {
        token: "admin-secret",
      },
      health: {
        probe: async () => ({ latencyMs: 120000, imageBytes: 640000, message: "probe ok" }),
      },
    });

    const probe = await app.inject({
      method: "POST",
      url: `/api/admin/health/provider-models/${model.id}/probe`,
      headers: { "x-admin-token": "admin-secret" },
    });
    const status = await app.inject({
      method: "GET",
      url: `/api/health/provider-models/${model.id}`,
    });

    expect(probe.statusCode).toBe(200);
    expect(probe.json()).toMatchObject({ status: "success", providerModelId: model.id });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({
      providerModelId: model.id,
      latestStatus: "success",
      healthy: true,
    });
  });
});
