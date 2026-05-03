import { describe, expect, it } from "vitest";

import { createPlatformClient } from "./platformClient";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

describe("platformClient", () => {
  it("posts a hosted generation job with the logged-in user id", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const client = createPlatformClient({
      baseUrl: "https://example.com",
      fetch: async (url, init) => {
        calls.push({ url: String(url), init });
        return jsonResponse({ id: "job-1", status: "queued" });
      },
    });

    const job = await client.createGenerationJob({
      userId: "user-1",
      prompt: "product poster",
      imageModel: "gpt-image-2",
    });

    expect(job).toMatchObject({ id: "job-1", status: "queued" });
    expect(calls).toEqual([
      {
        url: "https://example.com/api/generation-jobs",
        init: {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            userId: "user-1",
            prompt: "product poster",
            imageModel: "gpt-image-2",
          }),
        },
      },
    ]);
  });

  it("loads the platform dashboard data endpoints", async () => {
    const urls: string[] = [];
    const client = createPlatformClient({
      baseUrl: "",
      fetch: async (url) => {
        urls.push(String(url));
        if (String(url) === "/api/status") {
          return jsonResponse({ providerState: "closed", imageModel: "gpt-image-2" });
        }
        if (String(url) === "/api/prompt-templates") {
          return jsonResponse({ templates: [{ id: "portrait-1", title: "Portrait", category: "portrait" }] });
        }
        if (String(url) === "/api/credits/user-1") {
          return jsonResponse({ balance: 1, ledger: [] });
        }
        if (String(url) === "/api/users/user-1/generation-jobs") {
          return jsonResponse({ jobs: [{ id: "job-1", status: "queued" }] });
        }
        throw new Error(`Unexpected URL ${String(url)}`);
      },
    });

    await expect(client.getStatus()).resolves.toMatchObject({ providerState: "closed" });
    await expect(client.listPromptTemplates()).resolves.toHaveLength(1);
    await expect(client.getCredits("user-1")).resolves.toMatchObject({ balance: 1 });
    await expect(client.listUserJobs("user-1")).resolves.toHaveLength(1);
    expect(urls).toEqual([
      "/api/status",
      "/api/prompt-templates",
      "/api/credits/user-1",
      "/api/users/user-1/generation-jobs",
    ]);
  });

  it("throws a readable API error message", async () => {
    const client = createPlatformClient({
      baseUrl: "",
      fetch: async () => jsonResponse({ error: "Hosted image service is temporarily paused." }, { status: 503 }),
    });

    await expect(client.getStatus()).rejects.toThrow("Hosted image service is temporarily paused.");
  });

  it("loads payment packages, creates payment requests, and approves payments with an admin token", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const client = createPlatformClient({
      baseUrl: "",
      fetch: async (url, init) => {
        calls.push({ url: String(url), init });
        if (String(url) === "/api/payment-packages") {
          return jsonResponse({ packages: [{ amountCny: 5, credits: 50 }] });
        }
        if (String(url) === "/api/payments") {
          return jsonResponse({ id: "payment-1", status: "pending" });
        }
        if (String(url) === "/api/admin/payments/payment-1/approve") {
          return jsonResponse({ id: "payment-1", status: "approved" });
        }
        throw new Error(`Unexpected URL ${String(url)}`);
      },
    });

    await expect(client.listPaymentPackages()).resolves.toEqual([{ amountCny: 5, credits: 50 }]);
    await expect(
      client.createPaymentRequest({ userId: "user-1", amountCny: 5, note: "wechat demo" }),
    ).resolves.toMatchObject({ id: "payment-1" });
    await expect(
      client.approvePayment({ paymentId: "payment-1", adminUserId: "admin-1", adminToken: "admin-secret" }),
    ).resolves.toMatchObject({ status: "approved" });

    expect(calls[2]).toEqual({
      url: "/api/admin/payments/payment-1/approve",
      init: {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-token": "admin-secret" },
        body: JSON.stringify({ adminUserId: "admin-1" }),
      },
    });
  });

  it("reads and updates the admin health probe schedule", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const schedule = {
      dayStartHourUtc: 0,
      nightStartHourUtc: 14,
      dayIntervalMinutes: 30,
      nightIntervalMinutes: 60,
    };
    const client = createPlatformClient({
      baseUrl: "",
      fetch: async (url, init) => {
        calls.push({ url: String(url), init });
        return jsonResponse(schedule);
      },
    });

    await expect(client.getHealthProbeSchedule("admin-secret")).resolves.toEqual(schedule);
    await expect(client.updateHealthProbeSchedule({ adminToken: "admin-secret", schedule })).resolves.toEqual(
      schedule,
    );

    expect(calls).toEqual([
      {
        url: "/api/admin/health/probe-schedule",
        init: { headers: { "x-admin-token": "admin-secret" } },
      },
      {
        url: "/api/admin/health/probe-schedule",
        init: {
          method: "PUT",
          headers: { "content-type": "application/json", "x-admin-token": "admin-secret" },
          body: JSON.stringify(schedule),
        },
      },
    ]);
  });
});
