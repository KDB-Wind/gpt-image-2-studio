import { describe, expect, it } from "vitest";

import { createInMemoryPlatformRepository } from "./inMemoryRepository";

describe("platform repository", () => {
  it("creates a user credit account and records a daily free grant", async () => {
    const repo = createInMemoryPlatformRepository();
    const user = await repo.createUser({ email: "demo@example.com" });

    await repo.addCreditLedgerEvent({
      userId: user.id,
      eventType: "daily_free_grant",
      amount: 1,
      reason: "Daily free generation",
    });

    await expect(repo.getCreditBalance(user.id)).resolves.toBe(1);
  });

  it("creates a queued hosted generation job without debiting credits first", async () => {
    const repo = createInMemoryPlatformRepository();
    const user = await repo.createUser({ email: "demo@example.com" });
    await repo.addCreditLedgerEvent({
      userId: user.id,
      eventType: "daily_free_grant",
      amount: 1,
      reason: "Daily free generation",
    });

    const job = await repo.createGenerationJob({
      userId: user.id,
      mode: "hosted",
      prompt: "A clean product poster for a ceramic cup",
      imageModel: "gpt-image-2",
      status: "queued",
    });

    await expect(repo.getCreditBalance(user.id)).resolves.toBe(1);
    expect(job.status).toBe("queued");
  });
});
