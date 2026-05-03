import { describe, expect, it } from "vitest";

import { createInMemoryPlatformRepository } from "@chat-to-image/platform-db/in-memory";
import { classifyProviderError } from "@chat-to-image/platform-core";
import {
  getHealthProbeIntervalMs,
  getProviderHealthSummary,
  runDueProviderHealthProbes,
  runProviderHealthProbe,
} from "./providerHealthService";

const nowMs = Date.UTC(2026, 4, 2, 12, 0, 0);

describe("providerHealthService", () => {
  it("runs a scheduled probe against one available key, not every key on the same provider", async () => {
    const repo = createInMemoryPlatformRepository();
    const model = await repo.upsertProviderModel({
      providerId: "ruoli",
      baseUrl: "https://ruoli.dev/v1",
      imageModel: "gpt-image-2",
      state: "closed",
      cooldownMs: 300000,
    });
    for (let index = 1; index <= 10; index += 1) {
      await repo.createProviderApiKey({
        providerModelId: model.id,
        label: `Key ${index}`,
        keyCiphertext: `encrypted-${index}`,
        maxInFlight: 1,
      });
    }

    const probedKeyIds: string[] = [];
    const results = await runDueProviderHealthProbes({
      repo,
      nowMs,
      probe: async ({ apiKey }) => {
        probedKeyIds.push(apiKey.id);
        return { latencyMs: 120000, imageBytes: 640000, message: "probe ok" };
      },
    });

    expect(results).toMatchObject([{ status: "success", providerModelId: model.id }]);
    expect(probedKeyIds).toHaveLength(1);
    await expect(repo.listProviderHealthEvents(model.id)).resolves.toMatchObject([
      { status: "success", apiKeyId: probedKeyIds[0], imageBytes: 640000 },
    ]);
  });

  it("uses configurable day and night probe intervals", async () => {
    const repo = createInMemoryPlatformRepository();

    await expect(
      getHealthProbeIntervalMs({ repo, now: new Date(Date.UTC(2026, 4, 2, 10, 0, 0)) }),
    ).resolves.toBe(30 * 60 * 1000);

    await repo.setAppSetting("health.probeSchedule", {
      dayStartHourUtc: 8,
      nightStartHourUtc: 20,
      dayIntervalMinutes: 15,
      nightIntervalMinutes: 45,
    });

    await expect(
      getHealthProbeIntervalMs({ repo, now: new Date(Date.UTC(2026, 4, 2, 12, 0, 0)) }),
    ).resolves.toBe(15 * 60 * 1000);
    await expect(
      getHealthProbeIntervalMs({ repo, now: new Date(Date.UTC(2026, 4, 2, 22, 0, 0)) }),
    ).resolves.toBe(45 * 60 * 1000);
  });

  it("summarizes the latest provider health status", async () => {
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
      keyCiphertext: "encrypted-key",
      maxInFlight: 1,
    });
    await repo.recordProviderHealthEvent({
      providerModelId: model.id,
      apiKeyId: key.id,
      status: "failure",
      latencyMs: 120000,
      imageBytes: 320000,
      message: "probe image was smaller than 500KB",
    });

    const summary = await getProviderHealthSummary({ repo, providerModelId: model.id });

    expect(summary).toMatchObject({
      providerModelId: model.id,
      state: "closed",
      latestStatus: "failure",
      healthy: false,
      latestEvent: { imageBytes: 320000 },
    });
  });

  it("marks too-small probe images as unhealthy and opens the provider circuit", async () => {
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

    const result = await runProviderHealthProbe({
      repo,
      providerModelId: model.id,
      nowMs,
      probe: async () => ({ latencyMs: 120000, imageBytes: 128000, message: "small image" }),
    });

    expect(result.status).toBe("failure");
    await expect(repo.getProviderModel(model.id)).resolves.toMatchObject({
      state: "open",
      lastFailureReason: "Health probe image was smaller than 500KB.",
    });
  });

  it("opens the provider circuit when a probe throws a cost-risk provider error", async () => {
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
      keyCiphertext: "encrypted-key",
      maxInFlight: 1,
    });
    const error = new Error(
      'Request failed with status 524: {"error":{"message":"openai_error","type":"bad_response_status_code"}}',
    ) as Error & { classification: ReturnType<typeof classifyProviderError> };
    error.classification = classifyProviderError({
      status: 524,
      message: error.message,
    });

    const result = await runProviderHealthProbe({
      repo,
      providerModelId: model.id,
      nowMs,
      probe: async () => {
        throw error;
      },
    });

    expect(result).toMatchObject({
      status: "failure",
      apiKeyId: key.id,
      message: expect.stringContaining("524"),
    });
    await expect(repo.getProviderModel(model.id)).resolves.toMatchObject({
      state: "open",
      openUntil: new Date(nowMs + 300000),
      lastFailureReason: "Provider failure may have consumed image-generation cost.",
    });
    await expect(repo.listProviderApiKeys(model.id)).resolves.toMatchObject([
      {
        id: key.id,
        state: "cooldown",
        cooldownUntil: new Date(nowMs + 300000),
      },
    ]);
  });
});
