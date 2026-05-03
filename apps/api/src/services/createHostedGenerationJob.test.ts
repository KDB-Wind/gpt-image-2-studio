import { describe, expect, it } from "vitest";

import { createInMemoryPlatformRepository } from "@chat-to-image/platform-db/in-memory";
import { classifyProviderError, createProviderCircuit, recordProviderFailure } from "@chat-to-image/platform-core";
import { createHostedGenerationJob } from "./createHostedGenerationJob";

const nowMs = Date.UTC(2026, 4, 2, 12, 0, 0);

describe("createHostedGenerationJob", () => {
  it("queues a hosted job when provider is healthy and an API key is available", async () => {
    const repo = createInMemoryPlatformRepository();
    const user = await repo.createUser({ email: "demo@example.com" });
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
      keyCiphertext: "env:test-key",
      maxInFlight: 1,
    });

    const provider = createProviderCircuit({
      providerId: "ruoli",
      baseUrl: "https://ruoli.dev/v1",
      imageModel: "gpt-image-2",
      nowMs,
    });

    const result = await createHostedGenerationJob({
      repo,
      provider,
      nowMs,
      userId: user.id,
      prompt: "A bright commercial product poster",
      imageModel: "gpt-image-2",
      enqueue: async (jobId) => ({ queueId: `queue-${jobId}` }),
    });

    expect(result.status).toBe("queued");
    await expect(repo.getCreditBalance(user.id)).resolves.toBe(1);
  });

  it("rejects unknown users before granting daily credit or enqueueing", async () => {
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
      keyCiphertext: "env:test-key",
      maxInFlight: 1,
    });

    await expect(
      createHostedGenerationJob({
        repo,
        provider: createProviderCircuit({
          providerId: "ruoli",
          baseUrl: "https://ruoli.dev/v1",
          imageModel: "gpt-image-2",
          nowMs,
        }),
        nowMs,
        userId: "user-does-not-exist",
        prompt: "A portrait",
        imageModel: "gpt-image-2",
        enqueue: async () => {
          throw new Error("enqueue should not run");
        },
      }),
    ).rejects.toThrow("User is not allowed");

    await expect(repo.getCreditBalance("user-does-not-exist")).resolves.toBe(0);
  });

  it("does not enqueue or debit when supplier circuit is open", async () => {
    const repo = createInMemoryPlatformRepository();
    const user = await repo.createUser({ email: "demo@example.com" });
    await repo.addCreditLedgerEvent({
      userId: user.id,
      eventType: "daily_free_grant",
      amount: 1,
      reason: "Daily grant",
    });
    const openProvider = recordProviderFailure(
      createProviderCircuit({
        providerId: "ruoli",
        baseUrl: "https://ruoli.dev/v1",
        imageModel: "gpt-image-2",
        nowMs,
      }),
      classifyProviderError({ status: 524 }),
      nowMs,
    );

    await expect(
      createHostedGenerationJob({
        repo,
        provider: openProvider,
        nowMs,
        userId: user.id,
        prompt: "A portrait",
        imageModel: "gpt-image-2",
        enqueue: async () => {
          throw new Error("enqueue should not run");
        },
      }),
    ).rejects.toThrow("Hosted image service is temporarily paused");

    await expect(repo.getCreditBalance(user.id)).resolves.toBe(1);
  });

  it("blocks hosted jobs when the persisted provider model is already open", async () => {
    const repo = createInMemoryPlatformRepository();
    const user = await repo.createUser({ email: "demo@example.com" });
    await repo.addCreditLedgerEvent({
      userId: user.id,
      eventType: "daily_free_grant",
      amount: 1,
      reason: "Daily grant",
    });
    await repo.upsertProviderModel({
      providerId: "ruoli",
      baseUrl: "https://ruoli.dev/v1",
      imageModel: "gpt-image-2",
      state: "open",
      cooldownMs: 300000,
      openedAt: new Date(nowMs),
      openUntil: new Date(nowMs + 300000),
      lastFailureReason: "Provider returned a paid empty image response.",
    });

    await expect(
      createHostedGenerationJob({
        repo,
        provider: createProviderCircuit({
          providerId: "ruoli",
          baseUrl: "https://ruoli.dev/v1",
          imageModel: "gpt-image-2",
          nowMs,
        }),
        nowMs,
        userId: user.id,
        prompt: "A portrait",
        imageModel: "gpt-image-2",
        enqueue: async () => {
          throw new Error("enqueue should not run");
        },
      }),
    ).rejects.toThrow("Hosted image service is temporarily paused");

    await expect(repo.getCreditBalance(user.id)).resolves.toBe(1);
  });

  it("blocks hosted jobs before enqueueing when no hosted API key is enabled", async () => {
    const repo = createInMemoryPlatformRepository();
    const user = await repo.createUser({ email: "demo@example.com" });
    await repo.upsertProviderModel({
      providerId: "ruoli",
      baseUrl: "https://ruoli.dev/v1",
      imageModel: "gpt-image-2",
      state: "closed",
      cooldownMs: 300000,
    });

    await expect(
      createHostedGenerationJob({
        repo,
        provider: createProviderCircuit({
          providerId: "ruoli",
          baseUrl: "https://ruoli.dev/v1",
          imageModel: "gpt-image-2",
          nowMs,
        }),
        nowMs,
        userId: user.id,
        prompt: "A portrait",
        imageModel: "gpt-image-2",
        enqueue: async () => {
          throw new Error("enqueue should not run");
        },
      }),
    ).rejects.toThrow("Hosted image service is not configured");

    await expect(repo.getCreditBalance(user.id)).resolves.toBe(0);
  });

  it("blocks hosted jobs while every hosted API key is disabled or cooling down", async () => {
    const repo = createInMemoryPlatformRepository();
    const user = await repo.createUser({ email: "demo@example.com" });
    const model = await repo.upsertProviderModel({
      providerId: "ruoli",
      baseUrl: "https://ruoli.dev/v1",
      imageModel: "gpt-image-2",
      state: "closed",
      cooldownMs: 300000,
    });
    const disabledKey = await repo.createProviderApiKey({
      providerModelId: model.id,
      label: "Disabled Key",
      keyCiphertext: "env:disabled",
      maxInFlight: 1,
    });
    await repo.updateProviderApiKey(disabledKey.id, { enabled: false, state: "disabled" });
    const cooldownKey = await repo.createProviderApiKey({
      providerModelId: model.id,
      label: "Cooldown Key",
      keyCiphertext: "env:cooldown",
      maxInFlight: 1,
    });
    await repo.updateProviderApiKey(cooldownKey.id, {
      state: "cooldown",
      cooldownUntil: new Date(nowMs + 60_000),
    });

    await expect(
      createHostedGenerationJob({
        repo,
        provider: createProviderCircuit({
          providerId: "ruoli",
          baseUrl: "https://ruoli.dev/v1",
          imageModel: "gpt-image-2",
          nowMs,
        }),
        nowMs,
        userId: user.id,
        prompt: "A portrait",
        imageModel: "gpt-image-2",
        enqueue: async () => {
          throw new Error("enqueue should not run");
        },
      }),
    ).rejects.toThrow("Hosted image service is not configured");

    await expect(repo.getCreditBalance(user.id)).resolves.toBe(0);
  });
});
