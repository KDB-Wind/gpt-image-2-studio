import { describe, expect, it } from "vitest";

import { callOpenAIImageProvider, ProviderImageError } from "./index";

function jsonResponse(payload: unknown, init?: { ok?: boolean; status?: number }) {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as Response;
}

describe("OpenAI-compatible image provider", () => {
  it("sends text-to-image requests to /images/generations with image settings", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];

    const result = await callOpenAIImageProvider(
      {
        baseUrl: "https://ruoli.dev/v1",
        apiKey: "sk-test",
        model: "gpt-image-2",
        prompt: "A clean product poster",
        size: "1024x1024",
        quality: "high",
        resolution: "2k",
        n: 1,
        outputFormat: "png",
        timeoutMs: 240000,
      },
      {
        fetch: async (url, init) => {
          calls.push({ url: String(url), init: init ?? {} });
          return jsonResponse({ data: [{ b64_json: "aW1hZ2U=", revised_prompt: "poster" }] });
        },
      },
    );

    expect(calls[0].url).toBe("https://ruoli.dev/v1/images/generations");
    expect(calls[0].init.headers).toMatchObject({
      Authorization: "Bearer sk-test",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({
      model: "gpt-image-2",
      prompt: "A clean product poster",
      size: "1024x1024",
      quality: "high",
      resolution: "2k",
      n: 1,
      output_format: "png",
    });
    expect(result.images).toEqual([{ base64: "aW1hZ2U=", revisedPrompt: "poster" }]);
  });

  it("sends multi-image image-to-image requests to /images/edits as multipart form data", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];

    await callOpenAIImageProvider(
      {
        baseUrl: "https://ruoli.dev",
        apiKey: "sk-test",
        model: "gpt-image-2",
        prompt: "Use both references",
        size: "1536x1024",
        quality: "auto",
        resolution: "1k",
        n: 1,
        outputFormat: "png",
        timeoutMs: 240000,
        referenceImages: [
          { data: "Zmlyc3Q=", mimeType: "image/png", filename: "first.png" },
          { data: "c2Vjb25k", mimeType: "image/jpeg", filename: "second.jpg" },
        ],
      },
      {
        fetch: async (url, init) => {
          calls.push({ url: String(url), init: init ?? {} });
          return jsonResponse({ data: [{ b64_json: "cmVzdWx0" }] });
        },
      },
    );

    const body = calls[0].init.body as FormData;

    expect(calls[0].url).toBe("https://ruoli.dev/v1/images/edits");
    expect(calls[0].init.headers).toMatchObject({ Authorization: "Bearer sk-test" });
    expect(calls[0].init.headers).not.toHaveProperty("Content-Type");
    expect(body.get("model")).toBe("gpt-image-2");
    expect(body.get("prompt")).toBe("Use both references");
    expect(body.get("size")).toBe("1536x1024");
    expect(body.getAll("image")).toHaveLength(2);
  });

  it("classifies empty image responses as cost-risk provider errors", async () => {
    await expect(
      callOpenAIImageProvider(
        {
          baseUrl: "https://ruoli.dev/v1",
          apiKey: "sk-test",
          model: "gpt-image-2",
          prompt: "A portrait",
          size: "1024x1024",
          quality: "auto",
          resolution: "1k",
          n: 1,
          outputFormat: "png",
          timeoutMs: 240000,
        },
        {
          fetch: async () => jsonResponse({ data: [] }),
        },
      ),
    ).rejects.toMatchObject({
      name: "ProviderImageError",
      classification: { category: "cost_risk", shouldOpenProviderCircuit: true },
    });
  });

  it("classifies HTTP 524 openai_error responses as cost-risk provider errors", async () => {
    await expect(
      callOpenAIImageProvider(
        {
          baseUrl: "https://ruoli.dev/v1",
          apiKey: "sk-test",
          model: "gpt-image-2",
          prompt: "A portrait",
          size: "1024x1024",
          quality: "auto",
          resolution: "1k",
          n: 1,
          outputFormat: "png",
          timeoutMs: 240000,
        },
        {
          fetch: async () =>
            jsonResponse(
              { error: { message: "openai_error", type: "bad_response_status_code", code: "bad_response_status_code" } },
              { ok: false, status: 524 },
            ),
        },
      ),
    ).rejects.toMatchObject({
      name: "ProviderImageError",
      status: 524,
      classification: { category: "cost_risk", shouldOpenProviderCircuit: true },
    });
  });

  it("classifies aborted provider calls as timeout failures", async () => {
    await expect(
      callOpenAIImageProvider(
        {
          baseUrl: "https://ruoli.dev/v1",
          apiKey: "sk-test",
          model: "gpt-image-2",
          prompt: "A portrait",
          size: "1024x1024",
          quality: "auto",
          resolution: "1k",
          n: 1,
          outputFormat: "png",
          timeoutMs: 240000,
        },
        {
          fetch: async (_url, init) =>
            new Promise((_resolve, reject) => {
              void init;
              reject(new DOMException("Aborted", "AbortError"));
            }),
        },
      ),
    ).rejects.toMatchObject({
      name: "ProviderImageError",
      classification: { category: "timeout", shouldOpenProviderCircuit: false },
    });
  });

  it("exposes provider image errors as Error instances", () => {
    const error = new ProviderImageError("failed", {
      classification: {
        category: "unknown",
        reason: "unknown",
        shouldOpenProviderCircuit: false,
        shouldCooldownApiKey: false,
        shouldDisableApiKey: false,
        userChargeable: false,
      },
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ProviderImageError");
  });
});
