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

export type ProviderCallResult = ApiKeyResult;

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

  if (providerResult.kind === "success") {
    const decision = getGenerationCreditDecision({ kind: "success" });
    await input.repo.addCreditLedgerEvent({
      userId: job.userId,
      eventType: decision.ledgerEvent,
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
