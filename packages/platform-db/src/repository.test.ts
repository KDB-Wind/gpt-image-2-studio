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

  it("lists users for admin management in newest-first order", async () => {
    const repo = createInMemoryPlatformRepository();
    const older = await repo.createUser({ email: "older@example.com" });
    const newer = await repo.createUser({ email: "newer@example.com" });

    await expect(repo.listUsers()).resolves.toEqual([newer, older]);
    await expect(repo.listUsers(1)).resolves.toEqual([newer]);
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

  it("stores auth, provider, result, payment, audit, template, health, and settings records", async () => {
    const repo = createInMemoryPlatformRepository();
    const user = await repo.createUser({ email: "Demo@Example.com" });

    const code = await repo.createEmailVerificationCode({
      email: "Demo@Example.com",
      codeHash: "hash-123",
      expiresAt: new Date("2026-05-02T12:10:00.000Z"),
      ipAddress: "127.0.0.1",
    });
    await repo.markEmailVerificationCodeUsed(code.id, new Date("2026-05-02T12:02:00.000Z"));
    await repo.incrementEmailVerificationCodeAttempts(code.id);

    const session = await repo.createSession({
      userId: user.id,
      tokenHash: "session-hash",
      expiresAt: new Date("2026-05-09T12:00:00.000Z"),
    });
    const provider = await repo.upsertProviderModel({
      providerId: "ruoli",
      baseUrl: "https://ruoli.dev/v1",
      imageModel: "gpt-image-2",
      state: "closed",
      cooldownMs: 300000,
    });
    const key = await repo.createProviderApiKey({
      providerModelId: provider.id,
      label: "Key 1",
      keyCiphertext: "encrypted-key",
      maxInFlight: 1,
    });
    await repo.recordProviderHealthEvent({
      providerModelId: provider.id,
      apiKeyId: key.id,
      status: "success",
      latencyMs: 120000,
      imageBytes: 600000,
      message: "probe ok",
    });

    const template = await repo.upsertPromptTemplate({
      id: "portrait-editorial",
      category: "portrait",
      title: "Editorial portrait",
      description: "A clean portrait template",
      prompt: "Create an editorial portrait of {{person}}.",
      variables: [{ key: "person", label: "Person", placeholder: "a founder", required: true }],
      sourceUrl: "https://example.com/source",
      license: "CC0",
      enabled: true,
    });
    const job = await repo.createGenerationJob({
      userId: user.id,
      mode: "hosted",
      prompt: "A portrait",
      imageModel: "gpt-image-2",
      status: "queued",
      size: "1024x1024",
      quality: "high",
      resolution: "1k",
      referenceImageCount: 2,
      timeoutMs: 240000,
    });
    const result = await repo.createGenerationResult({
      jobId: job.id,
      storagePath: "storage/generated/job-1.png",
      mimeType: "image/png",
      bytes: 734003,
      width: 1024,
      height: 1024,
    });
    const payment = await repo.createPayment({
      userId: user.id,
      amountCny: 10,
      credits: 10,
      status: "pending",
      note: "wechat remark",
    });
    await repo.recordAdminAuditLog({
      adminUserId: user.id,
      action: "payment.review",
      targetType: "payment",
      targetId: payment.id,
      detail: { status: "pending" },
    });
    await repo.setAppSetting("health.dayIntervalMinutes", 30);

    await expect(repo.getSessionByTokenHash("session-hash")).resolves.toMatchObject({ id: session.id });
    await expect(repo.listProviderApiKeys(provider.id)).resolves.toHaveLength(1);
    await expect(repo.listPromptTemplates()).resolves.toEqual([template]);
    await expect(repo.getGenerationResults(job.id)).resolves.toEqual([result]);
    await expect(repo.getAppSetting("health.dayIntervalMinutes")).resolves.toBe(30);
    await expect(repo.getCreditBalance(user.id)).resolves.toBe(0);
  });
});
