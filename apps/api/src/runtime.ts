import { createHash } from "node:crypto";

import type { PlatformRepository, ProviderApiKey, ProviderModel } from "@chat-to-image/platform-db";
import { createInMemoryPlatformRepository } from "@chat-to-image/platform-db/in-memory";
import { createDrizzlePlatformRepository, createNodePgDrizzleClient } from "@chat-to-image/platform-db/drizzle";
import type { ProviderCircuit } from "@chat-to-image/platform-core";
import {
  callOpenAIImageProvider,
  type OpenAIImageProviderInput,
  type OpenAIImageProviderResult,
  type ProviderImage,
} from "@chat-to-image/provider";

export type HostedProviderApiKeyEnv = {
  label: string;
  secret: string;
  fingerprint: string;
  keyCiphertext: string;
};

export type RuntimeRepository = {
  repo: PlatformRepository;
  mode: "memory" | "postgres";
  close: () => Promise<void>;
};

export type RuntimeRepositoryEnv = {
  DATABASE_URL?: string;
  NODE_ENV?: string;
};

export type RuntimeRepositoryDependencies = {
  createDrizzleRepository?: (connectionString: string) => Omit<RuntimeRepository, "mode"> | RuntimeRepository;
};

export type SyncHostedProviderResult = {
  model: ProviderModel;
  keys: ProviderApiKey[];
};

export type OpenAIProviderHealthProbeDependencies = {
  callImageProvider?: (input: OpenAIImageProviderInput) => Promise<OpenAIImageProviderResult>;
  fetchImageBytes?: (url: string) => Promise<number>;
  now?: () => number;
};

const DEFAULT_PROVIDER_ID = "ruoli";
const DEFAULT_BASE_URL = "https://ruoli.dev/v1";
const DEFAULT_IMAGE_MODEL = "gpt-image-2";
const DEFAULT_PROVIDER_COOLDOWN_MS = 5 * 60 * 1000;
const DEFAULT_GENERATION_TIMEOUT_MS = 240_000;

export function createRuntimeRepository(
  env: RuntimeRepositoryEnv = process.env,
  deps: RuntimeRepositoryDependencies = {},
): RuntimeRepository {
  if (env.DATABASE_URL) {
    const runtime = (deps.createDrizzleRepository ?? createDefaultDrizzleRepository)(env.DATABASE_URL);
    return { ...runtime, mode: "postgres" };
  }

  if (env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is required in production. Refusing to use the in-memory repository.");
  }

  return {
    repo: createInMemoryPlatformRepository(),
    mode: "memory",
    close: async () => undefined,
  };
}

export function parseHostedProviderApiKeys(env: NodeJS.ProcessEnv | Record<string, string | undefined>): HostedProviderApiKeyEnv[] {
  const secrets: string[] = [];

  pushSecret(secrets, env.PLATFORM_API_KEY);
  for (const secret of splitKeyList(env.PLATFORM_API_KEYS)) {
    pushSecret(secrets, secret);
  }

  const numberedKeys = Object.entries(env)
    .map(([name, value]) => ({ match: /^PLATFORM_API_KEY_(\d+)$/.exec(name), value }))
    .filter((entry): entry is { match: RegExpExecArray; value: string } => Boolean(entry.match) && Boolean(entry.value))
    .sort((left, right) => Number(left.match[1]) - Number(right.match[1]));

  for (const entry of numberedKeys) {
    pushSecret(secrets, entry.value);
  }

  return secrets.map((secret, index) => {
    const fingerprint = fingerprintSecret(secret);
    return {
      label: `Hosted Key ${index + 1}`,
      secret,
      fingerprint,
      keyCiphertext: `env:${fingerprint}`,
    };
  });
}

export async function syncHostedProviderFromEnv(input: {
  repo: PlatformRepository;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  nowMs: number;
}): Promise<SyncHostedProviderResult> {
  const env = input.env ?? process.env;
  const existing = await input.repo.getProviderModelByKey(
    getProviderBaseUrl(env),
    getProviderImageModel(env),
  );
  const model = await input.repo.upsertProviderModel({
    id: existing?.id,
    providerId: getProviderId(env),
    baseUrl: getProviderBaseUrl(env),
    imageModel: getProviderImageModel(env),
    state: existing?.state ?? "closed",
    cooldownMs: getProviderCooldownMs(env),
    openedAt: existing?.openedAt ?? null,
    openUntil: existing?.openUntil ?? null,
    lastFailureReason: existing?.lastFailureReason ?? null,
  });
  const envKeys = parseHostedProviderApiKeys(env);
  const existingKeys = await input.repo.listProviderApiKeys(model.id);
  const existingByCiphertext = new Map(existingKeys.map((key) => [key.keyCiphertext, key]));
  const activeCiphertexts = new Set(envKeys.map((key) => key.keyCiphertext));

  for (const key of envKeys) {
    const existingKey = existingByCiphertext.get(key.keyCiphertext);
    if (!existingKey) {
      await input.repo.createProviderApiKey({
        providerModelId: model.id,
        label: key.label,
        keyCiphertext: key.keyCiphertext,
        maxInFlight: getApiKeyMaxInFlight(env),
      });
      continue;
    }

    if (!existingKey.enabled || existingKey.state === "disabled") {
      await input.repo.updateProviderApiKey(existingKey.id, {
        enabled: true,
        state: "healthy",
        cooldownUntil: null,
        maxInFlight: getApiKeyMaxInFlight(env),
      });
    }
  }

  for (const key of existingKeys) {
    if (key.keyCiphertext.startsWith("env:") && !activeCiphertexts.has(key.keyCiphertext) && key.enabled) {
      await input.repo.updateProviderApiKey(key.id, {
        enabled: false,
        state: "disabled",
        cooldownUntil: null,
      });
    }
  }

  return {
    model,
    keys: await input.repo.listProviderApiKeys(model.id),
  };
}

export function providerModelToCircuit(model: ProviderModel): ProviderCircuit {
  return {
    providerId: model.providerId,
    baseUrl: model.baseUrl,
    imageModel: model.imageModel,
    state: model.state === "open" || model.state === "half_open" ? model.state : "closed",
    openedAtMs: model.openedAt?.getTime() ?? null,
    openUntilMs: model.openUntil?.getTime() ?? null,
    cooldownMs: model.cooldownMs,
    halfOpenProbeInFlight: false,
    consecutiveCostRiskFailures: 0,
    lastFailureReason: model.lastFailureReason,
  };
}

export function createOpenAIProviderHealthProbe(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
  deps: OpenAIProviderHealthProbeDependencies = {},
) {
  const now = deps.now ?? (() => Date.now());
  const callImageProviderImpl = deps.callImageProvider ?? callOpenAIImageProvider;

  return async (input: { providerModel: ProviderModel; apiKey: ProviderApiKey }) => {
    const apiKey = resolveHostedApiKeySecret(input.apiKey, env);
    const startedAt = now();
    const result = await callImageProviderImpl({
      baseUrl: input.providerModel.baseUrl,
      apiKey,
      model: input.providerModel.imageModel,
      prompt: "health check image, simple bright color square, no text",
      size: "1024x1024",
      quality: "low",
      resolution: "1k",
      outputFormat: "png",
      n: 1,
      timeoutMs: getGenerationTimeoutMs(env),
    });

    return {
      latencyMs: Math.max(0, now() - startedAt),
      imageBytes: await getProviderImagesBytes(result.images, deps),
      message: "OpenAI-compatible image provider health probe succeeded.",
    };
  };
}

function createDefaultDrizzleRepository(connectionString: string): RuntimeRepository {
  const { pool, db } = createNodePgDrizzleClient(connectionString);
  return {
    repo: createDrizzlePlatformRepository({ db }),
    mode: "postgres",
    close: () => pool.end(),
  };
}

function getProviderId(env: NodeJS.ProcessEnv | Record<string, string | undefined>): string {
  return env.PLATFORM_PROVIDER_ID?.trim() || DEFAULT_PROVIDER_ID;
}

function getProviderBaseUrl(env: NodeJS.ProcessEnv | Record<string, string | undefined>): string {
  return normalizeBaseUrl(env.PLATFORM_BASE_URL?.trim() || DEFAULT_BASE_URL);
}

function getProviderImageModel(env: NodeJS.ProcessEnv | Record<string, string | undefined>): string {
  return env.PLATFORM_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;
}

function getProviderCooldownMs(env: NodeJS.ProcessEnv | Record<string, string | undefined>): number {
  return parsePositiveInteger(env.PROVIDER_CIRCUIT_COOLDOWN_MS, DEFAULT_PROVIDER_COOLDOWN_MS);
}

function getGenerationTimeoutMs(env: NodeJS.ProcessEnv | Record<string, string | undefined>): number {
  return parsePositiveInteger(env.GENERATION_JOB_TIMEOUT_MS, DEFAULT_GENERATION_TIMEOUT_MS);
}

function getApiKeyMaxInFlight(env: NodeJS.ProcessEnv | Record<string, string | undefined>): number {
  return parsePositiveInteger(env.PLATFORM_API_KEY_MAX_IN_FLIGHT, 1);
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

function splitKeyList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value.split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean);
}

function pushSecret(secrets: string[], value: string | undefined) {
  const secret = value?.trim();
  if (!secret || secrets.includes(secret)) {
    return;
  }

  secrets.push(secret);
}

function fingerprintSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex").slice(0, 16);
}

export function resolveHostedApiKeySecret(
  apiKey: ProviderApiKey,
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): string {
  const match = parseHostedProviderApiKeys(env).find((key) => key.keyCiphertext === apiKey.keyCiphertext);
  if (!match) {
    throw new Error(`Hosted API key secret is not available for ${apiKey.id}.`);
  }

  return match.secret;
}

async function getProviderImagesBytes(
  images: ProviderImage[],
  deps: Pick<OpenAIProviderHealthProbeDependencies, "fetchImageBytes">,
): Promise<number> {
  let total = 0;

  for (const image of images) {
    if (image.base64) {
      total += Buffer.byteLength(Buffer.from(stripDataUrlPrefix(image.base64), "base64"));
      continue;
    }

    if (image.url) {
      total += await (deps.fetchImageBytes ?? fetchImageBytes)(image.url);
    }
  }

  return total;
}

function stripDataUrlPrefix(value: string): string {
  const marker = ";base64,";
  const index = value.indexOf(marker);
  return index >= 0 ? value.slice(index + marker.length) : value;
}

async function fetchImageBytes(url: string): Promise<number> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download generated health probe image: ${response.status}`);
  }

  return (await response.arrayBuffer()).byteLength;
}
