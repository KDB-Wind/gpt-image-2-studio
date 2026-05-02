import { describe, expect, it } from "vitest";

import {
  ProviderCircuitOpenError,
  classifyProviderError,
  createHealthProbeAttempt,
  createProviderCircuit,
  getGenerationCreditDecision,
  pickApiKey,
  recordApiKeyResult,
  shouldRunScheduledHealthProbe,
  type ApiKeyRuntimeState,
} from "./platformCore";

const nowMs = Date.UTC(2026, 4, 2, 12, 0, 0);
const cooldownMs = 5 * 60 * 1000;

function key(index: number, overrides: Partial<ApiKeyRuntimeState> = {}): ApiKeyRuntimeState {
  return {
    id: `key-${index}`,
    label: `Key ${index}`,
    enabled: true,
    state: "healthy",
    cooldownUntilMs: null,
    inFlight: 0,
    maxInFlight: 2,
    success15m: 10,
    fail15m: 1,
    costRiskFail15m: 0,
    rateLimit15m: 0,
    success1h: 40,
    fail1h: 2,
    consecutiveFailures: 0,
    consecutiveCostRiskFailures: 0,
    ewmaLatencyMs: index % 2 === 0 ? null : 1000,
    lastUsedAtMs: nowMs - index * 1_000,
    ...overrides,
  };
}

function keys(count: number): ApiKeyRuntimeState[] {
  return Array.from({ length: count }, (_, index) => key(index + 1));
}

function provider() {
  return createProviderCircuit({
    providerId: "ruoli",
    baseUrl: "https://ruoli.dev/v1",
    imageModel: "gpt-image-2",
    nowMs,
    cooldownMs,
  });
}

describe("platformCore", () => {
  it("opens the supplier circuit after one costly failure and does not route to the other nine keys", () => {
    const hostedKeys = keys(10);
    const selected = pickApiKey(hostedKeys, provider(), { nowMs, random: () => 0 });
    const failed = recordApiKeyResult(
      selected,
      provider(),
      {
        kind: "failure",
        classification: classifyProviderError({ status: 524 }),
      },
      nowMs,
    );

    expect(failed.provider.state).toBe("open");
    expect(() => pickApiKey(hostedKeys.slice(1), failed.provider, { nowMs })).toThrow(ProviderCircuitOpenError);
    expect(() => pickApiKey(hostedKeys.slice(1), failed.provider, { nowMs })).toThrow(
      "Provider failure may have consumed image-generation cost.",
    );
    expect(shouldRunScheduledHealthProbe(failed.provider, nowMs + 60_000)).toBe(false);
  });

  it("allows exactly one recovery probe after the circuit window", () => {
    const hostedKeys = keys(10);
    const failed = recordApiKeyResult(
      pickApiKey(hostedKeys, provider(), { nowMs, random: () => 0 }),
      provider(),
      {
        kind: "failure",
        classification: classifyProviderError({ status: 524 }),
      },
      nowMs,
    );
    const afterCooldown = nowMs + cooldownMs + 1;

    const attempt = createHealthProbeAttempt(hostedKeys, failed.provider, afterCooldown);

    expect(attempt.provider.state).toBe("half_open");
    expect(attempt.provider.halfOpenProbeInFlight).toBe(true);
    expect(() => createHealthProbeAttempt(hostedKeys, attempt.provider, afterCooldown + 1)).toThrow(
      ProviderCircuitOpenError,
    );
  });

  it("returns no debit and costRisk true for provider cost-risk failures", () => {
    expect(getGenerationCreditDecision({ kind: "provider_cost_risk_failure" })).toMatchObject({
      debitCredits: 0,
      costRisk: true,
    });
  });
});
