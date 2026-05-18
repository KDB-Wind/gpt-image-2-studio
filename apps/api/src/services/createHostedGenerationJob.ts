import type { PlatformRepository, ProviderApiKey, ProviderModel } from "@chat-to-image/platform-db";
import { canUseProvider, isApiKeyAvailable, type ApiKeyRuntimeState, type ProviderCircuit } from "@chat-to-image/platform-core";
import { grantDailyFreeCredit } from "./creditService";

export type EnqueueGenerationJob = (jobId: string) => Promise<{ queueId: string }>;

export type CreateHostedGenerationJobInput = {
  repo: PlatformRepository;
  provider: ProviderCircuit;
  nowMs: number;
  userId: string;
  prompt: string;
  imageModel: string;
  enqueue: EnqueueGenerationJob;
};

export async function createHostedGenerationJob(input: CreateHostedGenerationJobInput) {
  const user = await input.repo.getUser(input.userId);
  if (!user || user.disabled) {
    throw new Error("User is not allowed to create hosted generation jobs. No credit was used.");
  }

  const model = await getPersistedProviderModel(input);
  const provider = model ? providerModelToCircuit(model) : input.provider;
  const availability = canUseProvider(provider, input.nowMs, "user");
  if (!availability.allowed) {
    throw new Error("Hosted image service is temporarily paused. No credit was used.");
  }

  if (!model) {
    throw new Error("Hosted image service is not configured. No credit was used.");
  }
  await assertHostedApiKeyAvailable(input.repo, model, input.nowMs);

  await grantDailyFreeCredit({
    repo: input.repo,
    userId: input.userId,
    now: new Date(input.nowMs),
  });

  const balance = await input.repo.getCreditBalance(input.userId);
  if (balance < 1) {
    throw new Error("Insufficient credits.");
  }

  const job = await input.repo.createGenerationJob({
    userId: input.userId,
    mode: "hosted",
    prompt: input.prompt,
    imageModel: input.imageModel,
    status: "queued",
  });

  await input.enqueue(job.id);
  return job;
}

async function getPersistedProviderModel(input: CreateHostedGenerationJobInput): Promise<ProviderModel | null> {
  return input.repo.getProviderModelByKey(input.provider.baseUrl, input.imageModel);
}

async function assertHostedApiKeyAvailable(
  repo: PlatformRepository,
  model: ProviderModel,
  nowMs: number,
) {
  const keys = await repo.listProviderApiKeys(model.id);
  const hasAvailableKey = keys.some((key) => isApiKeyAvailable(toRuntimeKey(key), nowMs));

  if (!hasAvailableKey) {
    throw new Error("Hosted image service is not configured. No credit was used.");
  }
}

function providerModelToCircuit(model: ProviderModel): ProviderCircuit {
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

function toRuntimeKey(apiKey: ProviderApiKey): ApiKeyRuntimeState {
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
    lastUsedAtMs: null,
  };
}
