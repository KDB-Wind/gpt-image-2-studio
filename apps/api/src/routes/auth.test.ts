import { describe, expect, it } from "vitest";

import { createInMemoryPlatformRepository } from "@chat-to-image/platform-db/in-memory";
import { createProviderCircuit } from "@chat-to-image/platform-core";
import { buildApiApp } from "../app";

const nowMs = Date.UTC(2026, 4, 2, 12, 0, 0);

describe("auth routes", () => {
  it("rejects admin user changes when the admin token is missing", async () => {
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
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/admin/users/${user.id}/disabled`,
      payload: { adminUserId: "admin-1", disabled: true },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: "Admin API token is not configured." });
  });

  it("requests an email code, verifies it, and lets an admin disable the user", async () => {
    const repo = createInMemoryPlatformRepository();
    const sent: Array<{ email: string; code: string }> = [];
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
      auth: {
        generateCode: () => "123456",
        generateToken: () => "session-token",
        hashCode: (code, email) => `hash:${email}:${code}`,
        hashToken: (token) => `token:${token}`,
        sendCode: async (message) => {
          sent.push(message);
        },
      },
    });

    const requestCode = await app.inject({
      method: "POST",
      url: "/api/auth/request-code",
      payload: { email: "demo@example.com" },
    });
    const verify = await app.inject({
      method: "POST",
      url: "/api/auth/verify",
      payload: { email: "demo@example.com", code: "123456" },
    });
    const userId = verify.json().user.id;
    const disable = await app.inject({
      method: "POST",
      url: `/api/admin/users/${userId}/disabled`,
      headers: { "x-admin-token": "admin-secret" },
      payload: { adminUserId: "admin-1", disabled: true },
    });

    expect(requestCode.statusCode).toBe(200);
    expect(sent).toEqual([{ email: "demo@example.com", code: "123456" }]);
    expect(verify.statusCode).toBe(200);
    expect(verify.json()).toMatchObject({ sessionToken: "session-token", user: { email: "demo@example.com" } });
    expect(disable.statusCode).toBe(200);
    expect(disable.json()).toMatchObject({ disabled: true });
  });
});
