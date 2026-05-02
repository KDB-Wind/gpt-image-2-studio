import type { ProviderErrorClassification } from "./providerErrors";
import {
  ProviderCircuitOpenError,
  canUseProvider,
  recordProviderFailure,
  recordProviderSuccess,
  type ProviderCircuit,
} from "./providerCircuit";

export type ApiKeyState = "healthy" | "cooldown" | "disabled";

export type ApiKeyRuntimeState = {
  id: string;
  label: string;
  enabled: boolean;
  state: ApiKeyState;
  cooldownUntilMs: number | null;
  inFlight: number;
  maxInFlight: number;
  success15m: number;
  fail15m: number;
  costRiskFail15m: number;
  rateLimit15m: number;
  success1h: number;
  fail1h: number;
  consecutiveFailures: number;
  consecutiveCostRiskFailures: number;
  ewmaLatencyMs: number | null;
  lastUsedAtMs: number | null;
};

export type PickApiKeyOptions = {
  nowMs: number;
  random?: () => number;
};

export type ApiKeyResult =
  | { kind: "success"; latencyMs: number }
  | { kind: "failure"; classification: ProviderErrorClassification };

export type ApiKeyResultUpdate = {
  key: ApiKeyRuntimeState;
  provider: ProviderCircuit;
};

export class NoAvailableApiKeyError extends Error {
  constructor(message = "No hosted API key is currently available.") {
    super(message);
    this.name = "NoAvailableApiKeyError";
  }
}

const RATE_LIMIT_COOLDOWN_MS = 2 * 60 * 1000;
const COST_RISK_COOLDOWN_MS = 5 * 60 * 1000;
const ORDINARY_FAILURE_COOLDOWN_MS = 60 * 1000;
const LATENCY_ALPHA = 0.3;

export function isApiKeyAvailable(key: ApiKeyRuntimeState, nowMs: number): boolean {
  return scoreApiKey(key, nowMs) > 0;
}

export function scoreApiKey(key: ApiKeyRuntimeState, nowMs: number): number {
  if (!key.enabled || key.state === "disabled") {
    return 0;
  }

  if (key.cooldownUntilMs !== null && key.cooldownUntilMs > nowMs) {
    return 0;
  }

  if (key.inFlight >= key.maxInFlight) {
    return 0;
  }

  const availableCapacity = Math.max(1, key.maxInFlight - key.inFlight);
  const successSignal = key.success15m * 5 + key.success1h;
  const failurePenalty = key.fail15m * 4 + key.fail1h;
  const rateLimitPenalty = key.rateLimit15m * 25;
  const costRiskPenalty = key.costRiskFail15m * 40 + key.consecutiveCostRiskFailures * 50;
  const latencyPenalty = key.ewmaLatencyMs === null ? 0 : Math.round(Math.max(0, key.ewmaLatencyMs) / 100);
  const recencyPenalty =
    key.lastUsedAtMs === null ? 0 : Math.max(0, 60 - Math.floor((nowMs - key.lastUsedAtMs) / 1000));

  return Math.max(
    1,
    100 + availableCapacity * 20 + successSignal - failurePenalty - rateLimitPenalty - costRiskPenalty - latencyPenalty - recencyPenalty,
  );
}

export function pickApiKey(
  keys: readonly ApiKeyRuntimeState[],
  provider: ProviderCircuit,
  options: PickApiKeyOptions,
): ApiKeyRuntimeState {
  const availability = canUseProvider(provider, options.nowMs, "user");

  if (!availability.allowed) {
    throw new ProviderCircuitOpenError(availability.reason ?? "Provider circuit is not available.");
  }

  const candidates = keys
    .map((key) => ({ key, score: scoreApiKey(key, options.nowMs) }))
    .filter((entry) => entry.score > 0);

  if (candidates.length === 0) {
    throw new NoAvailableApiKeyError();
  }

  const random = normalizeRandom(options.random?.() ?? Math.random());
  const totalScore = candidates.reduce((sum, entry) => sum + entry.score, 0);
  let cursor = random * totalScore;

  for (const entry of candidates) {
    cursor -= entry.score;
    if (cursor <= 0) {
      return {
        ...entry.key,
        state: "healthy",
        inFlight: entry.key.inFlight + 1,
      };
    }
  }

  const fallback = candidates[candidates.length - 1];
  return {
    ...fallback.key,
    state: "healthy",
    inFlight: fallback.key.inFlight + 1,
  };
}

export function recordApiKeyResult(
  key: ApiKeyRuntimeState,
  provider: ProviderCircuit,
  result: ApiKeyResult,
  nowMs: number,
): ApiKeyResultUpdate {
  const baseKey = {
    ...key,
    inFlight: Math.max(0, key.inFlight - 1),
  };

  if (result.kind === "success") {
    return {
      key: {
        ...baseKey,
        enabled: baseKey.enabled,
        state: "healthy",
        cooldownUntilMs: null,
        success15m: baseKey.success15m + 1,
        success1h: baseKey.success1h + 1,
        consecutiveFailures: 0,
        consecutiveCostRiskFailures: 0,
        ewmaLatencyMs: updateLatency(baseKey.ewmaLatencyMs, result.latencyMs),
        lastUsedAtMs: nowMs,
      },
      provider: provider.state === "half_open" ? recordProviderSuccess(provider, nowMs) : provider,
    };
  }

  const classification = result.classification;
  const failedKey: ApiKeyRuntimeState = {
    ...baseKey,
    fail15m: baseKey.fail15m + 1,
    fail1h: baseKey.fail1h + 1,
    consecutiveFailures: baseKey.consecutiveFailures + 1,
    lastUsedAtMs: nowMs,
  };

  if (classification.shouldDisableApiKey) {
    return {
      key: {
        ...failedKey,
        enabled: false,
        state: "disabled",
        cooldownUntilMs: null,
      },
      provider: recordProviderFailure(provider, classification, nowMs),
    };
  }

  if (classification.category === "rate_limit") {
    return {
      key: {
        ...failedKey,
        state: "cooldown",
        cooldownUntilMs: nowMs + RATE_LIMIT_COOLDOWN_MS,
        rateLimit15m: failedKey.rateLimit15m + 1,
      },
      provider: recordProviderFailure(provider, classification, nowMs),
    };
  }

  if (classification.shouldOpenProviderCircuit) {
    return {
      key: {
        ...failedKey,
        state: "cooldown",
        cooldownUntilMs: nowMs + COST_RISK_COOLDOWN_MS,
        costRiskFail15m: failedKey.costRiskFail15m + 1,
        consecutiveCostRiskFailures: failedKey.consecutiveCostRiskFailures + 1,
      },
      provider: recordProviderFailure(provider, classification, nowMs),
    };
  }

  if (failedKey.consecutiveFailures >= 3) {
    return {
      key: {
        ...failedKey,
        state: "cooldown",
        cooldownUntilMs: nowMs + ORDINARY_FAILURE_COOLDOWN_MS,
      },
      provider: recordProviderFailure(provider, classification, nowMs),
    };
  }

  return {
    key: failedKey,
    provider: recordProviderFailure(provider, classification, nowMs),
  };
}

function updateLatency(previousLatencyMs: number | null, nextLatencyMs: number): number {
  if (previousLatencyMs === null || previousLatencyMs <= 0) {
    return nextLatencyMs;
  }

  return Math.round(previousLatencyMs * (1 - LATENCY_ALPHA) + nextLatencyMs * LATENCY_ALPHA);
}

function normalizeRandom(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value <= 0) {
    return 0;
  }

  if (value >= 1) {
    return 0.999999999999;
  }

  return value;
}
