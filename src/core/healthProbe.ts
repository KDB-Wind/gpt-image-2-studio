import { isApiKeyAvailable, type ApiKeyRuntimeState } from "./apiKeyRouter";
import {
  canUseProvider,
  ProviderCircuitOpenError,
  reserveProviderProbe,
  type ProviderCircuit,
} from "./providerCircuit";

export type HealthProbeAttempt = {
  key: ApiKeyRuntimeState;
  provider: ProviderCircuit;
};

// Closed providers are intentionally eligible for scheduled baseline checks configured by the platform.
// Providers that are still open before their cooldown expires remain ineligible.
export function shouldRunScheduledHealthProbe(provider: ProviderCircuit, nowMs: number): boolean {
  return canUseProvider(provider, nowMs, "health_probe").allowed;
}

export function createHealthProbeAttempt(
  keys: readonly ApiKeyRuntimeState[],
  provider: ProviderCircuit,
  nowMs: number,
): HealthProbeAttempt {
  const availability = canUseProvider(provider, nowMs, "health_probe");

  if (!availability.allowed) {
    throw new ProviderCircuitOpenError(availability.reason ?? "Provider circuit is not available for health probes.");
  }

  const probeKey = pickLeastUsedAvailableKey(keys, nowMs);
  const reservedProvider =
    availability.state === "half_open" ? reserveProviderProbe(provider, nowMs, "health_probe") : provider;

  return {
    key: {
      ...probeKey,
      state: "healthy",
      inFlight: probeKey.inFlight + 1,
    },
    provider: reservedProvider,
  };
}

function pickLeastUsedAvailableKey(keys: readonly ApiKeyRuntimeState[], nowMs: number): ApiKeyRuntimeState {
  const availableKeys = keys.filter((key) => isApiKeyAvailable(key, nowMs));

  if (availableKeys.length === 0) {
    throw new ProviderCircuitOpenError("No hosted API key is currently available for health probes.");
  }

  return availableKeys.reduce((best, candidate) => {
    const usageComparison = compareUsage(candidate, best);
    if (usageComparison < 0) {
      return candidate;
    }

    if (usageComparison > 0) {
      return best;
    }

    return compareLastUsedAt(candidate, best) < 0 ? candidate : best;
  });
}

function compareUsage(left: ApiKeyRuntimeState, right: ApiKeyRuntimeState): number {
  return getUsage(left) - getUsage(right);
}

function getUsage(key: ApiKeyRuntimeState): number {
  return key.success1h + key.fail1h + key.inFlight;
}

function compareLastUsedAt(left: ApiKeyRuntimeState, right: ApiKeyRuntimeState): number {
  const leftValue = left.lastUsedAtMs ?? Number.NEGATIVE_INFINITY;
  const rightValue = right.lastUsedAtMs ?? Number.NEGATIVE_INFINITY;

  return leftValue - rightValue;
}
