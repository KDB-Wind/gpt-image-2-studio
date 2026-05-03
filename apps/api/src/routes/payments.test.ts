import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createInMemoryPlatformRepository } from "@chat-to-image/platform-db/in-memory";
import { createProviderCircuit } from "@chat-to-image/platform-core";
import { buildApiApp } from "../app";

const nowMs = Date.UTC(2026, 4, 3, 12, 0, 0);

describe("payment routes", () => {
  it("lets a user create and list payment requests", async () => {
    const repo = createInMemoryPlatformRepository();
    const user = await repo.createUser({ email: "demo@example.com" });
    const headers = await createSessionHeaders(repo, user.id);
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

    const create = await app.inject({
      method: "POST",
      url: "/api/payments",
      headers,
      payload: {
        userId: user.id,
        amountCny: 5,
        note: "微信昵称 Demo",
      },
    });
    const list = await app.inject({
      method: "GET",
      url: `/api/users/${user.id}/payments`,
      headers,
    });

    expect(create.statusCode).toBe(200);
    expect(create.json()).toMatchObject({ userId: user.id, amountCny: 5, credits: 50, status: "pending" });
    expect(list.statusCode).toBe(200);
    expect(list.json().payments).toMatchObject([{ id: create.json().id, status: "pending" }]);
  });

  it("lets an admin approve a pending payment and grant credits", async () => {
    const repo = createInMemoryPlatformRepository();
    const user = await repo.createUser({ email: "demo@example.com" });
    const payment = await repo.createPayment({
      userId: user.id,
      amountCny: 10,
      credits: 100,
      status: "pending",
      note: "paid",
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
      admin: { token: "admin-secret" },
    });

    const approve = await app.inject({
      method: "POST",
      url: `/api/admin/payments/${payment.id}/approve`,
      headers: { "x-admin-token": "admin-secret" },
      payload: { adminUserId: "admin-1" },
    });

    expect(approve.statusCode).toBe(200);
    expect(approve.json()).toMatchObject({ id: payment.id, status: "approved" });
    await expect(repo.getCreditBalance(user.id)).resolves.toBe(100);
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
