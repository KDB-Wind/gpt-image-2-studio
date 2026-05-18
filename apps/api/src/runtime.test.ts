import { describe, expect, it } from "vitest";

import type { PlatformRepository } from "@chat-to-image/platform-db";
import { createInMemoryPlatformRepository } from "@chat-to-image/platform-db/in-memory";
import {
  createOpenAIProviderHealthProbe,
  createRuntimeRepository,
  parseHostedProviderApiKeys,
  syncHostedProviderFromEnv,
} from "./runtime";

const nowMs = Date.UTC(2026, 4, 3, 12, 0, 0);

describe("api runtime bootstrap", () => {
  it("parses any configured hosted API key count without assuming exactly ten keys", () => {
    expect(parseHostedProviderApiKeys({ PLATFORM_API_KEY: "sk-one" })).toHaveLength(1);

    expect(
      parseHostedProviderApiKeys({
        PLATFORM_API_KEYS: "sk-one\nsk-two, sk-three",
      }).map((key) => key.secret),
    ).toEqual(["sk-one", "sk-two", "sk-three"]);

    expect(
      parseHostedProviderApiKeys({
        PLATFORM_API_KEY_1: "sk-one",
        PLATFORM_API_KEY_2: "sk-two",
        PLATFORM_API_KEY_3: "sk-three",
        PLATFORM_API_KEY_4: "sk-four",
        PLATFORM_API_KEY_5: "sk-five",
      }).map((key) => key.label),
    ).toEqual(["Hosted Key 1", "Hosted Key 2", "Hosted Key 3", "Hosted Key 4", "Hosted Key 5"]);
  });

  it("syncs env-provided hosted keys as metadata without storing raw API keys", async () => {
    const repo = createInMemoryPlatformRepository();

    await syncHostedProviderFromEnv({
      repo,
      env: {
        PLATFORM_BASE_URL: "https://ruoli.dev/v1",
        PLATFORM_IMAGE_MODEL: "gpt-image-2",
        PLATFORM_API_KEY: "sk-one",
      },
      nowMs,
    });

    let model = await repo.getProviderModelByKey("https://ruoli.dev/v1", "gpt-image-2");
    expect(model).not.toBeNull();
    let keys = await repo.listProviderApiKeys(model!.id);
    expect(keys).toHaveLength(1);
    expect(keys[0].keyCiphertext).toMatch(/^env:/);
    expect(keys[0].keyCiphertext).not.toContain("sk-one");

    await syncHostedProviderFromEnv({
      repo,
      env: {
        PLATFORM_BASE_URL: "https://ruoli.dev/v1",
        PLATFORM_IMAGE_MODEL: "gpt-image-2",
        PLATFORM_API_KEYS: "sk-one,sk-two,sk-three",
      },
      nowMs,
    });

    model = await repo.getProviderModelByKey("https://ruoli.dev/v1", "gpt-image-2");
    keys = await repo.listProviderApiKeys(model!.id);
    expect(keys.filter((key) => key.enabled)).toHaveLength(3);

    await syncHostedProviderFromEnv({
      repo,
      env: {
        PLATFORM_BASE_URL: "https://ruoli.dev/v1",
        PLATFORM_IMAGE_MODEL: "gpt-image-2",
        PLATFORM_API_KEY: "sk-three",
      },
      nowMs,
    });

    keys = await repo.listProviderApiKeys(model!.id);
    expect(keys.filter((key) => key.enabled)).toHaveLength(1);
  });

  it("does not silently use the in-memory repository in production", () => {
    expect(() => createRuntimeRepository({ NODE_ENV: "production" })).toThrow("DATABASE_URL");

    const fakeRepo = createInMemoryPlatformRepository();
    const runtime = createRuntimeRepository(
      {
        NODE_ENV: "production",
        DATABASE_URL: "postgres://example",
      },
      {
        createDrizzleRepository: (connectionString) => {
          expect(connectionString).toBe("postgres://example");
          return { repo: fakeRepo, close: async () => undefined };
        },
      },
    );

    expect(runtime.mode).toBe("postgres");
    expect(runtime.repo).toBe(fakeRepo);
  });

  it("builds a real OpenAI-compatible health probe from env key metadata", async () => {
    const repo = createInMemoryPlatformRepository();
    const { model, keys } = await syncHostedProviderFromEnv({
      repo,
      env: {
        PLATFORM_BASE_URL: "https://ruoli.dev/v1",
        PLATFORM_IMAGE_MODEL: "gpt-image-2",
        PLATFORM_API_KEY: "sk-one",
      },
      nowMs,
    });
    const calls: Array<{ apiKey: string; prompt: string }> = [];
    const probe = createOpenAIProviderHealthProbe(
      { PLATFORM_API_KEY: "sk-one" },
      {
        callImageProvider: async (input) => {
          calls.push({ apiKey: input.apiKey, prompt: input.prompt });
          return {
            images: [{ base64: Buffer.from("probe-image").toString("base64") }],
            warnings: [],
            raw: {},
          };
        },
      },
    );

    const result = await probe({ providerModel: model, apiKey: keys[0] });

    expect(calls).toEqual([{ apiKey: "sk-one", prompt: expect.stringContaining("health check") }]);
    expect(result.imageBytes).toBe(Buffer.byteLength("probe-image"));
  });
});
