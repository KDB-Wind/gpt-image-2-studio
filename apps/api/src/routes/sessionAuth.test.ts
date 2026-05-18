import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createInMemoryPlatformRepository } from "@chat-to-image/platform-db/in-memory";
import { createProviderCircuit } from "@chat-to-image/platform-core";
import { buildApiApp } from "../app";

const nowMs = Date.UTC(2026, 4, 3, 12, 0, 0);

describe("session authenticated user routes", () => {
  it("requires a valid session token for user credit, job, and payment history", async () => {
    const repo = createInMemoryPlatformRepository();
    const user = await repo.createUser({ email: "demo@example.com" });
    const app = buildTestApp(repo);

    const credits = await app.inject({ method: "GET", url: `/api/credits/${user.id}` });
    const jobs = await app.inject({ method: "GET", url: `/api/users/${user.id}/generation-jobs` });
    const payments = await app.inject({ method: "GET", url: `/api/users/${user.id}/payments` });

    expect(credits.statusCode).toBe(401);
    expect(jobs.statusCode).toBe(401);
    expect(payments.statusCode).toBe(401);
  });

  it("rejects cross-user access even when the caller has a valid session", async () => {
    const repo = createInMemoryPlatformRepository();
    const owner = await repo.createUser({ email: "owner@example.com" });
    const attacker = await repo.createUser({ email: "attacker@example.com" });
    const token = "attacker-session";
    await repo.createSession({
      userId: attacker.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(nowMs + 60_000),
    });
    const app = buildTestApp(repo);

    const response = await app.inject({
      method: "GET",
      url: `/api/credits/${owner.id}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: "Session user does not match requested user." });
  });

  it("allows the session owner to create hosted jobs and payment requests", async () => {
    const repo = createInMemoryPlatformRepository();
    const user = await repo.createUser({ email: "demo@example.com" });
    const token = "owner-session";
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
    await repo.createSession({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(nowMs + 60_000),
    });
    const app = buildTestApp(repo);

    const job = await app.inject({
      method: "POST",
      url: "/api/generation-jobs",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        userId: user.id,
        prompt: "a clean product poster",
        imageModel: "gpt-image-2",
      },
    });
    const payment = await app.inject({
      method: "POST",
      url: "/api/payments",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        userId: user.id,
        amountCny: 5,
        note: "wechat paid",
      },
    });

    expect(job.statusCode).toBe(200);
    expect(payment.statusCode).toBe(200);
  });

  it("rejects create requests that try to act for a different user", async () => {
    const repo = createInMemoryPlatformRepository();
    const owner = await repo.createUser({ email: "owner@example.com" });
    const attacker = await repo.createUser({ email: "attacker@example.com" });
    const token = "attacker-session";
    await repo.createSession({
      userId: attacker.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(nowMs + 60_000),
    });
    const app = buildTestApp(repo);

    const response = await app.inject({
      method: "POST",
      url: "/api/payments",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        userId: owner.id,
        amountCny: 5,
        note: null,
      },
    });

    expect(response.statusCode).toBe(403);
  });
});

function buildTestApp(repo: ReturnType<typeof createInMemoryPlatformRepository>) {
  return buildApiApp({
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
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
