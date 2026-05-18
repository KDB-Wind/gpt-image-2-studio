import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ProviderApiKey, ProviderModel } from "@chat-to-image/platform-db";
import {
  classifyProviderError,
  type ApiKeyRuntimeState,
} from "@chat-to-image/platform-core";
import {
  callOpenAIImageProvider,
  ProviderImageError,
  type ProviderImage,
} from "@chat-to-image/provider";

import {
  createRuntimeRepository,
  providerModelToCircuit,
  resolveHostedApiKeySecret,
  syncHostedProviderFromEnv,
} from "../../api/src/runtime";
import { createGenerationWorker } from "./generationWorker";
import { runGenerationJob, type ProviderCallResult, type ProviderGeneratedImage } from "./runGenerationJob";

const runtime = createRuntimeRepository(process.env);
const { model } = await syncHostedProviderFromEnv({
  repo: runtime.repo,
  env: process.env,
  nowMs: Date.now(),
});

const connection = process.env.REDIS_URL
  ? { url: process.env.REDIS_URL }
  : {
      host: process.env.REDIS_HOST ?? "127.0.0.1",
      port: Number(process.env.REDIS_PORT ?? 6379),
    };

const worker = createGenerationWorker({
  connection,
  concurrency: Number(process.env.GENERATION_WORKER_CONCURRENCY ?? 2),
  timeoutMs: Number(process.env.GENERATION_JOB_TIMEOUT_MS ?? 240000),
  processor: async ({ jobId }) => {
    const nowMs = Date.now();
    const job = await runtime.repo.getGenerationJob(jobId);
    if (!job) {
      throw new Error(`Generation job not found: ${jobId}`);
    }

    const providerModel = await getProviderModel(job.imageModel);
    const apiKeys = await runtime.repo.listProviderApiKeys(providerModel.id);

    await runGenerationJob({
      repo: runtime.repo,
      jobId,
      provider: providerModelToCircuit(providerModel),
      keys: apiKeys.map((apiKey) => toRuntimeKey(apiKey, nowMs)),
      nowMs,
      callProvider: ({ key }) => callHostedProvider({ jobId, key, apiKeys, providerModel }),
    });
  },
});

const shutdown = async () => {
  if (hasClose(worker)) {
    await worker.close();
  }
  await runtime.close();
};

process.once("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});
process.once("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});

async function getProviderModel(imageModel: string): Promise<ProviderModel> {
  const latest = await runtime.repo.getProviderModelByKey(model.baseUrl, imageModel);
  if (latest) {
    return latest;
  }

  const fallback = await runtime.repo.getProviderModel(model.id);
  if (!fallback) {
    throw new Error(`Provider model not found: ${model.id}`);
  }

  return fallback;
}

async function callHostedProvider(input: {
  jobId: string;
  key: ApiKeyRuntimeState;
  apiKeys: ProviderApiKey[];
  providerModel: ProviderModel;
}): Promise<ProviderCallResult> {
  const startedAt = Date.now();
  const job = await runtime.repo.getGenerationJob(input.jobId);
  const apiKey = input.apiKeys.find((key) => key.id === input.key.id);

  try {
    if (!job) {
      throw new Error(`Generation job not found: ${input.jobId}`);
    }
    if (!apiKey) {
      throw new Error(`Selected hosted API key not found: ${input.key.id}`);
    }

    const result = await callOpenAIImageProvider({
      baseUrl: input.providerModel.baseUrl,
      apiKey: resolveHostedApiKeySecret(apiKey, process.env),
      model: input.providerModel.imageModel,
      prompt: job.prompt,
      size: job.size,
      quality: job.quality,
      resolution: job.resolution,
      outputFormat: "png",
      n: 1,
      timeoutMs: job.timeoutMs,
    });

    return {
      kind: "success",
      latencyMs: Date.now() - startedAt,
      images: await storeProviderImages(job.id, result.images),
    };
  } catch (error) {
    if (error instanceof ProviderImageError) {
      return { kind: "failure", classification: error.classification };
    }

    return {
      kind: "failure",
      classification: classifyProviderError({
        kind: "network",
        message: error instanceof Error ? error.message : "Hosted provider call failed.",
      }),
    };
  }
}

async function storeProviderImages(jobId: string, images: ProviderImage[]): Promise<ProviderGeneratedImage[]> {
  const outputDir = process.env.PLATFORM_OUTPUT_DIR || join(process.cwd(), "platform-outputs");
  const jobDir = join(outputDir, jobId);
  await mkdir(jobDir, { recursive: true });

  const stored: ProviderGeneratedImage[] = [];
  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    const { bytes, mimeType } = await readProviderImage(image);
    const extension = extensionFromMimeType(mimeType);
    const storagePath = join(jobDir, `image-${index + 1}.${extension}`);
    await writeFile(storagePath, bytes);

    stored.push({
      storagePath,
      mimeType,
      bytes: bytes.byteLength,
      width: null,
      height: null,
    });
  }

  return stored;
}

async function readProviderImage(image: ProviderImage): Promise<{ bytes: Buffer; mimeType: string }> {
  if (image.base64) {
    const { base64, mimeType } = parseBase64Image(image.base64);
    return { bytes: Buffer.from(base64, "base64"), mimeType };
  }

  if (image.url) {
    const response = await fetch(image.url);
    if (!response.ok) {
      throw new Error(`Failed to download generated image: HTTP ${response.status}`);
    }
    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      mimeType: response.headers.get("content-type")?.split(";")[0] || "image/png",
    };
  }

  throw new Error("Provider image did not include base64 data or URL.");
}

function parseBase64Image(value: string): { base64: string; mimeType: string } {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(value);
  if (!match) {
    return { base64: value, mimeType: "image/png" };
  }

  return { base64: match[2], mimeType: match[1] };
}

function extensionFromMimeType(mimeType: string): string {
  if (mimeType === "image/jpeg") {
    return "jpg";
  }

  const [, subtype = "png"] = mimeType.split("/");
  return subtype.replace(/[^a-z0-9]/gi, "") || "png";
}

function toRuntimeKey(apiKey: ProviderApiKey, nowMs: number): ApiKeyRuntimeState {
  return {
    id: apiKey.id,
    label: apiKey.label,
    enabled: apiKey.enabled,
    state: apiKey.state,
    cooldownUntilMs: apiKey.cooldownUntil?.getTime() ?? null,
    inFlight: 0,
    maxInFlight: apiKey.maxInFlight,
    success15m: 0,
    fail15m: 0,
    costRiskFail15m: 0,
    rateLimit15m: 0,
    success1h: 0,
    fail1h: 0,
    consecutiveFailures: 0,
    consecutiveCostRiskFailures: 0,
    ewmaLatencyMs: null,
    lastUsedAtMs: nowMs,
  };
}

function hasClose(value: unknown): value is { close: () => Promise<void> } {
  return Boolean(value && typeof value === "object" && "close" in value && typeof value.close === "function");
}
