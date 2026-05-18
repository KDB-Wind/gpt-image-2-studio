import { describe, expect, it } from "vitest";

import { createInMemoryPlatformRepository } from "@chat-to-image/platform-db/in-memory";
import { classifyProviderError, createApiKeyRuntimeState, createProviderCircuit } from "@chat-to-image/platform-core";
import { runGenerationJob } from "./runGenerationJob";

const nowMs = Date.UTC(2026, 4, 2, 12, 0, 0);

describe("runGenerationJob provider integration", () => {
  it("stores provider image outputs as generation results after a successful call", async () => {
    const repo = createInMemoryPlatformRepository();
    const user = await repo.createUser({ email: "demo@example.com" });
    await repo.addCreditLedgerEvent({
      userId: user.id,
      eventType: "daily_free_grant",
      amount: 1,
      reason: "Daily grant",
    });
    const job = await repo.createGenerationJob({
      userId: user.id,
      mode: "hosted",
      prompt: "A bright product poster",
      imageModel: "gpt-image-2",
      status: "queued",
    });

    await runGenerationJob({
      repo,
      jobId: job.id,
      provider: createProviderCircuit({
        providerId: "ruoli",
        baseUrl: "https://ruoli.dev/v1",
        imageModel: "gpt-image-2",
        nowMs,
      }),
      keys: [createApiKeyRuntimeState({ id: "key-1", label: "Key 1", maxInFlight: 1 })],
      nowMs,
      callProvider: async () => ({
        kind: "success",
        latencyMs: 120000,
        images: [
          {
            storagePath: "outputs/job-1/image-1.png",
            mimeType: "image/png",
            bytes: 640000,
            width: 1024,
            height: 1024,
          },
        ],
      }),
    });

    await expect(repo.getGenerationResults(job.id)).resolves.toMatchObject([
      {
        jobId: job.id,
        storagePath: "outputs/job-1/image-1.png",
        mimeType: "image/png",
        bytes: 640000,
      },
    ]);
  });

  it("opens the provider circuit after one cost-risk failure without calling a second same-provider key", async () => {
    const repo = createInMemoryPlatformRepository();
    const user = await repo.createUser({ email: "demo@example.com" });
    await repo.addCreditLedgerEvent({
      userId: user.id,
      eventType: "daily_free_grant",
      amount: 1,
      reason: "Daily grant",
    });
    const job = await repo.createGenerationJob({
      userId: user.id,
      mode: "hosted",
      prompt: "A portrait",
      imageModel: "gpt-image-2",
      status: "queued",
    });
    let calls = 0;

    const result = await runGenerationJob({
      repo,
      jobId: job.id,
      provider: createProviderCircuit({
        providerId: "ruoli",
        baseUrl: "https://ruoli.dev/v1",
        imageModel: "gpt-image-2",
        nowMs,
      }),
      keys: [
        createApiKeyRuntimeState({ id: "key-1", label: "Key 1", maxInFlight: 1 }),
        createApiKeyRuntimeState({ id: "key-2", label: "Key 2", maxInFlight: 1 }),
      ],
      nowMs,
      callProvider: async () => {
        calls += 1;
        return {
          kind: "failure",
          classification: classifyProviderError({
            status: 524,
            responseBody:
              '{"error":{"message":"openai_error","type":"bad_response_status_code","code":"bad_response_status_code"}}',
          }),
        };
      },
    });

    expect(calls).toBe(1);
    expect(result.provider.state).toBe("open");
    await expect(repo.getCreditBalance(user.id)).resolves.toBe(1);
  });

  it("persists provider circuit and selected key updates after a cost-risk failure", async () => {
    const repo = createInMemoryPlatformRepository();
    const user = await repo.createUser({ email: "demo@example.com" });
    await repo.addCreditLedgerEvent({
      userId: user.id,
      eventType: "daily_free_grant",
      amount: 1,
      reason: "Daily grant",
    });
    const model = await repo.upsertProviderModel({
      providerId: "ruoli",
      baseUrl: "https://ruoli.dev/v1",
      imageModel: "gpt-image-2",
      state: "closed",
      cooldownMs: 300000,
    });
    const apiKey = await repo.createProviderApiKey({
      providerModelId: model.id,
      label: "Key 1",
      keyCiphertext: "env:fingerprint",
      maxInFlight: 1,
    });
    const job = await repo.createGenerationJob({
      userId: user.id,
      mode: "hosted",
      prompt: "A portrait",
      imageModel: "gpt-image-2",
      status: "queued",
    });

    await runGenerationJob({
      repo,
      jobId: job.id,
      provider: createProviderCircuit({
        providerId: "ruoli",
        baseUrl: "https://ruoli.dev/v1",
        imageModel: "gpt-image-2",
        nowMs,
      }),
      keys: [createApiKeyRuntimeState({ id: apiKey.id, label: "Key 1", maxInFlight: 1 })],
      nowMs,
      callProvider: async () => ({
        kind: "failure",
        classification: classifyProviderError({
          status: 524,
          responseBody:
            '{"error":{"message":"openai_error","type":"bad_response_status_code","code":"bad_response_status_code"}}',
        }),
      }),
    });

    await expect(repo.getProviderModel(model.id)).resolves.toMatchObject({
      state: "open",
      lastFailureReason: expect.stringContaining("cost"),
    });
    await expect(repo.listProviderApiKeys(model.id)).resolves.toMatchObject([
      {
        id: apiKey.id,
        state: "cooldown",
      },
    ]);
  });
});
