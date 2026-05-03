import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createInMemoryPlatformRepository } from "@chat-to-image/platform-db/in-memory";
import { createProviderCircuit } from "@chat-to-image/platform-core";
import { buildApiApp } from "../app";

const nowMs = Date.UTC(2026, 4, 3, 12, 0, 0);

describe("generation job routes", () => {
  it("returns a user job history ordered by newest first", async () => {
    const repo = createInMemoryPlatformRepository();
    const user = await repo.createUser({ email: "demo@example.com" });
    const headers = await createSessionHeaders(repo, user.id);
    const older = await repo.createGenerationJob({
      userId: user.id,
      mode: "hosted",
      prompt: "older portrait",
      imageModel: "gpt-image-2",
      status: "succeeded",
    });
    const newer = await repo.createGenerationJob({
      userId: user.id,
      mode: "hosted",
      prompt: "newer product poster",
      imageModel: "gpt-image-2",
      status: "queued",
    });
    await repo.updateGenerationJob(older.id, { updatedAt: new Date(nowMs - 60_000) });
    await repo.updateGenerationJob(newer.id, { updatedAt: new Date(nowMs) });
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
      method: "GET",
      url: `/api/users/${user.id}/generation-jobs`,
      headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().jobs.map((job: { id: string }) => job.id)).toEqual([newer.id, older.id]);
  });

  it("returns a generation job with its stored results", async () => {
    const repo = createInMemoryPlatformRepository();
    const user = await repo.createUser({ email: "demo@example.com" });
    const headers = await createSessionHeaders(repo, user.id);
    const job = await repo.createGenerationJob({
      userId: user.id,
      mode: "hosted",
      prompt: "a bright product poster",
      imageModel: "gpt-image-2",
      status: "succeeded",
    });
    const result = await repo.createGenerationResult({
      jobId: job.id,
      storagePath: "platform-outputs/job-1/image-1.png",
      mimeType: "image/png",
      bytes: 756000,
      width: 1024,
      height: 1024,
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
      method: "GET",
      url: `/api/generation-jobs/${job.id}`,
      headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      job: { id: job.id, status: "succeeded" },
      results: [{ id: result.id, bytes: 756000, width: 1024, height: 1024 }],
    });
  });

  it("returns a readable service unavailable error when the hosted provider is paused", async () => {
    const repo = createInMemoryPlatformRepository();
    const user = await repo.createUser({ email: "demo@example.com" });
    const headers = await createSessionHeaders(repo, user.id);
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
    const app = buildApiApp({
      repo,
      provider: createProviderCircuit({
        providerId: "ruoli",
        baseUrl: "https://ruoli.dev/v1",
        imageModel: "gpt-image-2",
        nowMs,
      }),
      now: () => nowMs,
      enqueue: async () => {
        throw new Error("enqueue should not run");
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/generation-jobs",
      headers,
      payload: {
        userId: user.id,
        prompt: "a cinematic portrait",
        imageModel: "gpt-image-2",
      },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: "Hosted image service is temporarily paused. No credit was used.",
    });
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
