import { describe, expect, it } from "vitest";

import { createInMemoryPlatformRepository } from "@chat-to-image/platform-db/in-memory";
import { classifyProviderError, createProviderCircuit, recordProviderFailure } from "@chat-to-image/platform-core";
import { createHostedGenerationJob } from "./createHostedGenerationJob";

const nowMs = Date.UTC(2026, 4, 2, 12, 0, 0);

describe("createHostedGenerationJob", () => {
  it("queues a hosted job when provider is healthy and user has credits", async () => {
    const repo = createInMemoryPlatformRepository();
    const user = await repo.createUser({ email: "demo@example.com" });
    await repo.addCreditLedgerEvent({
      userId: user.id,
      eventType: "daily_free_grant",
      amount: 1,
      reason: "Daily grant",
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
});
