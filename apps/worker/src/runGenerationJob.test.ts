import { describe, expect, it } from "vitest";

import { createInMemoryPlatformRepository } from "@chat-to-image/platform-db/in-memory";
import { classifyProviderError, createApiKeyRuntimeState, createProviderCircuit } from "@chat-to-image/platform-core";
import { runGenerationJob } from "./runGenerationJob";

const nowMs = Date.UTC(2026, 4, 2, 12, 0, 0);

describe("runGenerationJob", () => {
  it("debits one credit after successful provider generation", async () => {
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
        createApiKeyRuntimeState({
          id: "key-1",
          label: "Key 1",
          maxInFlight: 1,
        }),
      ],
      nowMs,
      callProvider: async () => ({ kind: "success", latencyMs: 120000 }),
    });

    expect(result.job.status).toBe("succeeded");
    await expect(repo.getCreditBalance(user.id)).resolves.toBe(0);
  });

  it("opens provider circuit and does not debit user on cost-risk failure", async () => {
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
        createApiKeyRuntimeState({
          id: "key-1",
          label: "Key 1",
          maxInFlight: 1,
        }),
      ],
      nowMs,
      callProvider: async () => ({
        kind: "failure",
        classification: classifyProviderError({ status: 524 }),
      }),
    });

    expect(result.provider.state).toBe("open");
    expect(result.job.status).toBe("failed");
    await expect(repo.getCreditBalance(user.id)).resolves.toBe(1);
  });
});
