import type {
  PlatformRepository,
  ProviderApiKey,
  ProviderHealthStatus,
  ProviderModel,
  ProviderModelHealthEvent,
} from "@chat-to-image/platform-db";
import {
  classifyProviderError,
  createHealthProbeAttempt,
  recordApiKeyResult,
  type ApiKeyRuntimeState,
  type HealthProbeAttempt,
  type ProviderCircuit,
  type ProviderErrorClassification,
} from "@chat-to-image/platform-core";

const MIN_HEALTHY_IMAGE_BYTES = 500 * 1024;

export type ProviderHealthProbe = (input: {
  providerModel: ProviderModel;
  apiKey: ProviderApiKey;
}) => Promise<{
  latencyMs: number;
  imageBytes: number;
  message?: string;
}>;

export type ProviderHealthResult = {
  providerModelId: string;
  apiKeyId: string | null;
  status: ProviderHealthStatus;
  latencyMs: number | null;
  imageBytes: number | null;
  message: string;
};

export type ProviderHealthSummary = {
  providerModelId: string;
  providerId: string;
  baseUrl: string;
  imageModel: string;
  state: ProviderModel["state"];
  healthy: boolean;
  latestStatus: ProviderHealthStatus | "unknown";
  latestEvent: ProviderModelHealthEvent | null;
};

export type HealthProbeSchedule = {
  dayStartHourUtc: number;
  nightStartHourUtc: number;
  dayIntervalMinutes: number;
  nightIntervalMinutes: number;
};

const DEFAULT_HEALTH_PROBE_SCHEDULE: HealthProbeSchedule = {
  dayStartHourUtc: 8,
  nightStartHourUtc: 22,
  dayIntervalMinutes: 30,
  nightIntervalMinutes: 60,
};

export async function runDueProviderHealthProbes(input: {
  repo: PlatformRepository;
  nowMs: number;
  probe: ProviderHealthProbe;
}): Promise<ProviderHealthResult[]> {
  const models = await input.repo.listProviderModels();
  const intervalMs = await getHealthProbeIntervalMs({
    repo: input.repo,
    now: new Date(input.nowMs),
  });
  const results: ProviderHealthResult[] = [];

  for (const model of models) {
    const latest = (await input.repo.listProviderHealthEvents(model.id, 1))[0] ?? null;
    if (latest && input.nowMs - latest.createdAt.getTime() < intervalMs) {
      continue;
    }

    results.push(
      await runProviderHealthProbe({
        repo: input.repo,
        providerModelId: model.id,
        nowMs: input.nowMs,
        probe: input.probe,
      }),
    );
  }

  return results;
}

export async function runProviderHealthProbe(input: {
  repo: PlatformRepository;
  providerModelId: string;
  nowMs: number;
  probe: ProviderHealthProbe;
}): Promise<ProviderHealthResult> {
  const providerModel = await input.repo.getProviderModel(input.providerModelId);
  if (!providerModel) {
    throw new Error(`Provider model not found: ${input.providerModelId}`);
  }

  const apiKeys = await input.repo.listProviderApiKeys(providerModel.id);
  if (apiKeys.length === 0) {
    return recordHealth(input.repo, providerModel.id, {
      apiKeyId: null,
      status: "skipped",
      latencyMs: null,
      imageBytes: null,
      message: "No API key is available for health probe.",
    });
  }

  let attempt: HealthProbeAttempt | null = null;
  let apiKey: ProviderApiKey | null = null;

  try {
    const selectedAttempt = createHealthProbeAttempt(
      apiKeys.map((apiKey) => toRuntimeKey(apiKey, input.nowMs)),
      toCircuit(providerModel),
      input.nowMs,
    );
    attempt = selectedAttempt;
    apiKey = apiKeys.find((key) => key.id === selectedAttempt.key.id) ?? null;
    if (!apiKey) {
      throw new Error(`Selected API key not found: ${selectedAttempt.key.id}`);
    }

    const probeResult = await input.probe({ providerModel, apiKey });
    if (probeResult.imageBytes < MIN_HEALTHY_IMAGE_BYTES) {
      const failureMessage = "Health probe image was smaller than 500KB.";
      const classification = classifyProviderError({
        status: 524,
        message: failureMessage,
      });
      const updated = recordApiKeyResult(attempt.key, attempt.provider, { kind: "failure", classification }, input.nowMs);
      await persistProviderCircuit(input.repo, providerModel, {
        ...updated.provider,
        lastFailureReason: failureMessage,
      });
      await persistRuntimeKey(input.repo, apiKey, updated.key);

      return recordHealth(input.repo, providerModel.id, {
        apiKeyId: apiKey.id,
        status: "failure",
        latencyMs: probeResult.latencyMs,
        imageBytes: probeResult.imageBytes,
        message: failureMessage,
      });
    }

    const updated = recordApiKeyResult(
      attempt.key,
      attempt.provider,
      { kind: "success", latencyMs: probeResult.latencyMs },
      input.nowMs,
    );
    await persistProviderCircuit(input.repo, providerModel, updated.provider);
    await persistRuntimeKey(input.repo, apiKey, updated.key);

    return recordHealth(input.repo, providerModel.id, {
      apiKeyId: apiKey.id,
      status: "success",
      latencyMs: probeResult.latencyMs,
      imageBytes: probeResult.imageBytes,
      message: probeResult.message ?? "Health probe succeeded.",
    });
  } catch (error) {
    if (attempt && apiKey) {
      await persistProbeFailure({
        repo: input.repo,
        providerModel,
        apiKey,
        attempt,
        error,
        nowMs: input.nowMs,
      });
    }

    return recordHealth(input.repo, providerModel.id, {
      apiKeyId: apiKey?.id ?? null,
      status: "failure",
      latencyMs: null,
      imageBytes: null,
      message: error instanceof Error ? error.message : "Health probe failed.",
    });
  }
}

export async function getProviderHealthSummary(input: {
  repo: PlatformRepository;
  providerModelId: string;
}): Promise<ProviderHealthSummary> {
  const model = await input.repo.getProviderModel(input.providerModelId);
  if (!model) {
    throw new Error(`Provider model not found: ${input.providerModelId}`);
  }

  const latestEvent = (await input.repo.listProviderHealthEvents(model.id, 1))[0] ?? null;
  const latestStatus = latestEvent?.status ?? "unknown";

  return {
    providerModelId: model.id,
    providerId: model.providerId,
    baseUrl: model.baseUrl,
    imageModel: model.imageModel,
    state: model.state,
    healthy: model.state === "closed" && latestStatus === "success",
    latestStatus,
    latestEvent,
  };
}

export async function getHealthProbeIntervalMs(input: {
  repo: Pick<PlatformRepository, "getAppSetting">;
  now: Date;
}): Promise<number> {
  const setting = await input.repo.getAppSetting("health.probeSchedule");
  const schedule = parseSchedule(setting);
  const hour = input.now.getUTCHours();
  const isDay = isHourInWindow(hour, schedule.dayStartHourUtc, schedule.nightStartHourUtc);
  const minutes = isDay ? schedule.dayIntervalMinutes : schedule.nightIntervalMinutes;
  return minutes * 60 * 1000;
}

function parseSchedule(value: unknown): HealthProbeSchedule {
  if (!value || typeof value !== "object") {
    return DEFAULT_HEALTH_PROBE_SCHEDULE;
  }

  const record = value as Partial<Record<keyof HealthProbeSchedule, unknown>>;
  return {
    dayStartHourUtc: parseHour(record.dayStartHourUtc, DEFAULT_HEALTH_PROBE_SCHEDULE.dayStartHourUtc),
    nightStartHourUtc: parseHour(record.nightStartHourUtc, DEFAULT_HEALTH_PROBE_SCHEDULE.nightStartHourUtc),
    dayIntervalMinutes: parsePositiveInteger(
      record.dayIntervalMinutes,
      DEFAULT_HEALTH_PROBE_SCHEDULE.dayIntervalMinutes,
    ),
    nightIntervalMinutes: parsePositiveInteger(
      record.nightIntervalMinutes,
      DEFAULT_HEALTH_PROBE_SCHEDULE.nightIntervalMinutes,
    ),
  };
}

function parseHour(value: unknown, fallback: number): number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 23 ? Number(value) : fallback;
}

function parsePositiveInteger(value: unknown, fallback: number): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function isHourInWindow(hour: number, start: number, end: number): boolean {
  if (start === end) {
    return true;
  }

  if (start < end) {
    return hour >= start && hour < end;
  }

  return hour >= start || hour < end;
}

async function recordHealth(
  repo: PlatformRepository,
  providerModelId: string,
  input: {
    apiKeyId: string | null;
    status: ProviderHealthStatus;
    latencyMs: number | null;
    imageBytes: number | null;
    message: string;
  },
): Promise<ProviderHealthResult> {
  await repo.recordProviderHealthEvent({
    providerModelId,
    apiKeyId: input.apiKeyId,
    status: input.status,
    latencyMs: input.latencyMs,
    imageBytes: input.imageBytes,
    message: input.message,
  });

  return {
    providerModelId,
    apiKeyId: input.apiKeyId,
    status: input.status,
    latencyMs: input.latencyMs,
    imageBytes: input.imageBytes,
    message: input.message,
  };
}

function toCircuit(model: ProviderModel): ProviderCircuit {
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

async function persistProviderCircuit(
  repo: PlatformRepository,
  model: ProviderModel,
  circuit: ProviderCircuit,
) {
  await repo.updateProviderModel(model.id, {
    state: circuit.state,
    openedAt: circuit.openedAtMs === null ? null : new Date(circuit.openedAtMs),
    openUntil: circuit.openUntilMs === null ? null : new Date(circuit.openUntilMs),
    lastFailureReason: circuit.lastFailureReason,
  });
}

async function persistRuntimeKey(
  repo: PlatformRepository,
  apiKey: ProviderApiKey,
  runtimeKey: ApiKeyRuntimeState,
) {
  await repo.updateProviderApiKey(apiKey.id, {
    enabled: runtimeKey.enabled,
    state: runtimeKey.state,
    cooldownUntil: runtimeKey.cooldownUntilMs === null ? null : new Date(runtimeKey.cooldownUntilMs),
  });
}

async function persistProbeFailure(input: {
  repo: PlatformRepository;
  providerModel: ProviderModel;
  apiKey: ProviderApiKey;
  attempt: HealthProbeAttempt;
  error: unknown;
  nowMs: number;
}) {
  const classification = getProbeErrorClassification(input.error);
  const updated = recordApiKeyResult(
    input.attempt.key,
    input.attempt.provider,
    { kind: "failure", classification },
    input.nowMs,
  );
  await persistProviderCircuit(input.repo, input.providerModel, updated.provider);
  await persistRuntimeKey(input.repo, input.apiKey, updated.key);
  return classification;
}

function getProbeErrorClassification(error: unknown): ProviderErrorClassification {
  const classification = getStructuralClassification(error);
  if (classification) {
    return classification;
  }

  return classifyProviderError({
    kind: "network",
    message: error instanceof Error ? error.message : "Health probe failed.",
  });
}

function getStructuralClassification(error: unknown): ProviderErrorClassification | null {
  if (!error || typeof error !== "object" || !("classification" in error)) {
    return null;
  }

  const classification = (error as { classification?: unknown }).classification;
  if (!classification || typeof classification !== "object") {
    return null;
  }

  const record = classification as Partial<ProviderErrorClassification>;
  if (
    typeof record.category !== "string" ||
    typeof record.reason !== "string" ||
    typeof record.shouldOpenProviderCircuit !== "boolean" ||
    typeof record.shouldCooldownApiKey !== "boolean" ||
    typeof record.shouldDisableApiKey !== "boolean" ||
    typeof record.userChargeable !== "boolean"
  ) {
    return null;
  }

  return record as ProviderErrorClassification;
}
