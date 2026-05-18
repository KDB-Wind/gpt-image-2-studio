import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createInMemoryPlatformRepository } from "@chat-to-image/platform-db/in-memory";
import { createProviderCircuit } from "@chat-to-image/platform-core";
import { buildApiApp } from "./app";

const nowMs = Date.UTC(2026, 4, 2, 12, 0, 0);

describe("api app", () => {
  it("returns service status", async () => {
    const app = buildApiApp({
      repo: createInMemoryPlatformRepository(),
      provider: createProviderCircuit({
        providerId: "ruoli",
        baseUrl: "https://ruoli.dev/v1",
        imageModel: "gpt-image-2",
        nowMs,
      }),
      now: () => nowMs,
      enqueue: async (jobId) => ({ queueId: `queue-${jobId}` }),
    });

    const response = await app.inject({ method: "GET", url: "/api/status" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ providerState: "closed" });
  });

  it("returns persisted provider circuit status when available", async () => {
    const repo = createInMemoryPlatformRepository();
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
    });

    const response = await app.inject({ method: "GET", url: "/api/status" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      providerState: "open",
      openUntilMs: nowMs + 300000,
    });
  });

  it("creates a hosted generation job", async () => {
    const repo = createInMemoryPlatformRepository();
    const user = await repo.createUser({ email: "demo@example.com" });
    const headers = await createSessionHeaders(repo, user.id);
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
    await repo.addCreditLedgerEvent({
      userId: user.id,
      eventType: "daily_free_grant",
      amount: 1,
      reason: "Daily grant",
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
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/generation-jobs",
      headers,
      payload: {
        userId: user.id,
        prompt: "A bright product poster",
        imageModel: "gpt-image-2",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "queued" });
  });
});

async function createSessionHeaders(repo: ReturnType<typeof createInMemoryPlatformRepository>, userId: string) {
  const token = `session-${userId}`;
  await repo.createSession({
    userId,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    expiresAt: new Date(nowMs + 60_000),
  });
  return { authorization: `Bearer ${token}` };
}
