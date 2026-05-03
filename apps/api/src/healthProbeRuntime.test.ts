import { describe, expect, it } from "vitest";

import { createInMemoryPlatformRepository } from "@chat-to-image/platform-db/in-memory";
import { runScheduledHealthProbeOnce } from "./healthProbeRuntime";

const nowMs = Date.UTC(2026, 4, 3, 12, 0, 0);

describe("healthProbeRuntime", () => {
  it("runs due provider health probes once and returns a concise summary", async () => {
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
      keyCiphertext: "env:test",
      maxInFlight: 1,
    });

    const summary = await runScheduledHealthProbeOnce({
      repo,
      nowMs,
      probe: async () => ({ latencyMs: 121000, imageBytes: 640000, message: "probe ok" }),
    });

    expect(summary).toEqual({
      checked: 1,
      success: 1,
      failure: 0,
      skipped: 0,
      messages: [`success:${model.id}:probe ok`],
    });
  });
});
