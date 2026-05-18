import { describe, expect, it } from "vitest";

import { createInMemoryPlatformRepository } from "@chat-to-image/platform-db/in-memory";
import { createProviderCircuit } from "@chat-to-image/platform-core";
import { buildApiApp } from "../app";

const nowMs = Date.UTC(2026, 4, 2, 12, 0, 0);

describe("prompt template routes", () => {
  it("rejects curated template sync when the admin token is missing", async () => {
    const repo = createInMemoryPlatformRepository();
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
      url: "/api/admin/prompt-templates/sync-curated",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: "Admin API token is not configured." });
  });

  it("syncs curated templates and lists enabled templates by category", async () => {
    const repo = createInMemoryPlatformRepository();
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

    const sync = await app.inject({
      method: "POST",
      url: "/api/admin/prompt-templates/sync-curated",
      headers: { "x-admin-token": "admin-secret" },
    });
    const list = await app.inject({
      method: "GET",
      url: "/api/prompt-templates?category=portrait",
    });

    expect(sync.statusCode).toBe(200);
    expect(sync.json().synced).toBeGreaterThan(0);
    expect(list.statusCode).toBe(200);
    expect(list.json().templates.length).toBeGreaterThan(0);
    expect(list.json().templates.every((template: { category: string }) => template.category === "portrait")).toBe(true);
  });
});
