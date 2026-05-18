import { describe, expect, it } from "vitest";

import { createInMemoryPlatformRepository } from "@chat-to-image/platform-db/in-memory";
import { addAdminCredits, getCreditOverview, grantDailyFreeCredit } from "./creditService";
import { createHostedGenerationJob } from "./createHostedGenerationJob";
import { createProviderCircuit } from "@chat-to-image/platform-core";

const now = new Date(Date.UTC(2026, 4, 2, 12, 0, 0));
const nowMs = now.getTime();

describe("creditService", () => {
  it("grants one daily free credit once per UTC day", async () => {
    const repo = createInMemoryPlatformRepository();
    const user = await repo.createUser({ email: "demo@example.com" });

    const first = await grantDailyFreeCredit({ repo, userId: user.id, now });
    const second = await grantDailyFreeCredit({ repo, userId: user.id, now: new Date(nowMs + 60_000) });

    expect(first).toMatchObject({ granted: true, amount: 1, balance: 1 });
    expect(second).toMatchObject({ granted: false, amount: 0, balance: 1 });
    await expect(repo.listCreditLedgerEvents(user.id)).resolves.toHaveLength(1);
  });

  it("lets admins add credits with an auditable ledger entry", async () => {
    const repo = createInMemoryPlatformRepository();
    const user = await repo.createUser({ email: "demo@example.com" });

    const result = await addAdminCredits({
      repo,
      adminUserId: "admin-1",
      userId: user.id,
      amount: 10,
      reason: "Manual recharge",
    });

    expect(result.balance).toBe(10);
    await expect(repo.listCreditLedgerEvents(user.id)).resolves.toMatchObject([
      { eventType: "admin_adjustment", amount: 10, reason: "Manual recharge" },
    ]);
  });

  it("returns credit balance and ledger entries for a user", async () => {
    const repo = createInMemoryPlatformRepository();
    const user = await repo.createUser({ email: "demo@example.com" });
    await grantDailyFreeCredit({ repo, userId: user.id, now });

    const overview = await getCreditOverview({ repo, userId: user.id });

    expect(overview.balance).toBe(1);
    expect(overview.ledger).toMatchObject([{ eventType: "daily_free_grant", amount: 1 }]);
  });

  it("grants the daily free credit before queueing a new user's first hosted job", async () => {
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
    const enqueued: string[] = [];

    const job = await createHostedGenerationJob({
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
      enqueue: async (jobId) => {
        enqueued.push(jobId);
        return { queueId: `queue-${jobId}` };
      },
    });

    expect(job.status).toBe("queued");
    expect(enqueued).toEqual([job.id]);
    await expect(repo.getCreditBalance(user.id)).resolves.toBe(1);
  });
});
