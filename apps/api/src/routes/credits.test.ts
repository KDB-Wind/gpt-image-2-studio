import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createInMemoryPlatformRepository } from "@chat-to-image/platform-db/in-memory";
import { createProviderCircuit } from "@chat-to-image/platform-core";
import { buildApiApp } from "../app";

const nowMs = Date.UTC(2026, 4, 2, 12, 0, 0);

describe("credit routes", () => {
  it("rejects admin credit changes when the admin token is invalid", async () => {
    const repo = createInMemoryPlatformRepository();
    const user = await repo.createUser({ email: "demo@example.com" });
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
      admin: {
        token: "admin-secret",
      },
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/admin/users/${user.id}/credits`,
      headers: { "x-admin-token": "wrong-secret" },
      payload: { adminUserId: "admin-1", amount: 5, reason: "Manual recharge" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: "Admin API token is invalid or missing." });
  });

  it("returns user credit overview and supports admin credit adjustment", async () => {
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
      admin: {
        token: "admin-secret",
      },
    });

    const add = await app.inject({
      method: "POST",
      url: `/api/admin/users/${user.id}/credits`,
      headers: { "x-admin-token": "admin-secret" },
      payload: { adminUserId: "admin-1", amount: 5, reason: "Manual recharge" },
    });
    const overview = await app.inject({
      method: "GET",
      url: `/api/credits/${user.id}`,
      headers,
    });

    expect(add.statusCode).toBe(200);
    expect(add.json()).toMatchObject({ balance: 5 });
    expect(overview.statusCode).toBe(200);
    expect(overview.json()).toMatchObject({
      balance: 5,
      ledger: [{ eventType: "admin_adjustment", amount: 5 }],
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
