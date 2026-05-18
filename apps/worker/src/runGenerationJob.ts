import type { CreditLedgerEventType, PlatformRepository } from "@chat-to-image/platform-db";
import {
  getGenerationCreditDecision,
  pickApiKey,
  recordApiKeyResult,
  type ApiKeyResult,
  type ApiKeyRuntimeState,
  type GenerationOutcomeKind,
  type ProviderErrorCategory,
  type ProviderCircuit,
} from "@chat-to-image/platform-core";

export type ProviderGeneratedImage = {
  storagePath: string;
  mimeType: string;
  bytes: number;
  width?: number | null;
  height?: number | null;
};

export type ProviderCallResult =
  | (Extract<ApiKeyResult, { kind: "success" }> & { images?: ProviderGeneratedImage[] })
  | Extract<ApiKeyResult, { kind: "failure" }>;

export type RunGenerationJobInput = {
  repo: PlatformRepository;
  jobId: string;
  provider: ProviderCircuit;
  keys: ApiKeyRuntimeState[];
  nowMs: number;
  callProvider: (input: { jobId: string; key: ApiKeyRuntimeState }) => Promise<ProviderCallResult>;
};

export async function runGenerationJob(input: RunGenerationJobInput) {
  const job = await input.repo.getGenerationJob(input.jobId);
  if (!job) {
    throw new Error(`Generation job not found: ${input.jobId}`);
  }

  const selectedKey = pickApiKey(input.keys, input.provider, {
    nowMs: input.nowMs,
    random: Math.random,
  });

  await input.repo.updateGenerationJob(job.id, {
    status: "running",
    selectedApiKeyId: selectedKey.id,
  });

  const providerResult = await input.callProvider({
    jobId: job.id,
    key: selectedKey,
  });

  const keyUpdate = recordApiKeyResult(selectedKey, input.provider, providerResult, input.nowMs);
  await persistProviderRuntimeState(input.repo, input.provider, keyUpdate);

  if (providerResult.kind === "success") {
    for (const image of providerResult.images ?? []) {
      await input.repo.createGenerationResult({
        jobId: job.id,
        storagePath: image.storagePath,
        mimeType: image.mimeType,
        bytes: image.bytes,
        width: image.width ?? null,
        height: image.height ?? null,
      });
    }

    const decision = getGenerationCreditDecision({ kind: "success" });
    await input.repo.addCreditLedgerEvent({
      userId: job.userId,
      eventType: mapLedgerEvent(decision.ledgerEvent),
      amount: -decision.debitCredits,
      reason: decision.userMessage,
    });
    const updatedJob = await input.repo.updateGenerationJob(job.id, {
      status: "succeeded",
      errorCategory: null,
    });
    return { job: updatedJob, provider: keyUpdate.provider, key: keyUpdate.key };
  }

  const decision = getGenerationCreditDecision({
    kind: mapFailureOutcome(providerResult.classification.category),
  });
  await input.repo.addCreditLedgerEvent({
    userId: job.userId,
    eventType: mapLedgerEvent(decision.ledgerEvent),
    amount: 0,
    reason: decision.userMessage,
  });
  const updatedJob = await input.repo.updateGenerationJob(job.id, {
    status: "failed",
    errorCategory: providerResult.classification.category,
  });
  return { job: updatedJob, provider: keyUpdate.provider, key: keyUpdate.key };
}

async function persistProviderRuntimeState(
  repo: PlatformRepository,
  provider: ProviderCircuit,
  update: ReturnType<typeof recordApiKeyResult>,
) {
  const model = await repo.getProviderModelByKey(provider.baseUrl, provider.imageModel);
  if (!model) {
    return;
  }

  await repo.updateProviderModel(model.id, {
    state: update.provider.state,
    openedAt: update.provider.openedAtMs === null ? null : new Date(update.provider.openedAtMs),
    openUntil: update.provider.openUntilMs === null ? null : new Date(update.provider.openUntilMs),
    lastFailureReason: update.provider.lastFailureReason,
  });

  const keys = await repo.listProviderApiKeys(model.id);
  if (!keys.some((key) => key.id === update.key.id)) {
    return;
  }

  await repo.updateProviderApiKey(update.key.id, {
    enabled: update.key.enabled,
    state: update.key.state,
    cooldownUntil: update.key.cooldownUntilMs === null ? null : new Date(update.key.cooldownUntilMs),
  });
}

function mapFailureOutcome(category: ProviderErrorCategory): GenerationOutcomeKind {
  if (category === "cost_risk") {
    return "provider_cost_risk_failure";
  }

  if (category === "auth") {
    return "auth_error";
  }

  if (category === "rate_limit") {
    return "rate_limited";
  }

  if (category === "timeout") {
    return "timeout";
  }

  if (category === "validation") {
    return "validation_error";
  }

  return "unknown_failure";
}

function mapLedgerEvent(eventType: string): CreditLedgerEventType {
  if (eventType === "provider_circuit_open_no_charge") {
    return "provider_circuit_open_no_charge";
  }

  if (eventType === "generation_debit") {
    return "generation_debit";
  }

  return "provider_failure_no_charge";
}
