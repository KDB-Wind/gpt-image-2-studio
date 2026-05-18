import { describe, expect, it } from "vitest";

import { classifyProviderError } from "./providerErrors";
import {
  ProviderCircuitOpenError,
  canUseProvider,
  createProviderCircuit,
  recordProviderFailure,
  reserveProviderProbe,
} from "./providerCircuit";
import {
  NoAvailableApiKeyError,
  type ApiKeyRuntimeState,
  isApiKeyAvailable,
  pickApiKey,
  recordApiKeyResult,
  scoreApiKey,
} from "./apiKeyRouter";

const nowMs = Date.UTC(2026, 4, 2, 12, 0, 0);

function key(overrides: Partial<ApiKeyRuntimeState> = {}): ApiKeyRuntimeState {
  return {
    id: "key-1",
    label: "Primary",
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
    ewmaLatencyMs: 1000,
    lastUsedAtMs: nowMs - 60_000,
    ...overrides,
  };
}

function provider() {
  return createProviderCircuit({
    providerId: "ruoli",
    baseUrl: "https://ruoli.dev/v1",
    imageModel: "gpt-image-2",
    nowMs,
  });
}

describe("apiKeyRouter", () => {
  it("scoreApiKey returns 0 for disabled, cooling, and full keys", () => {
    expect(scoreApiKey(key({ enabled: false }), nowMs)).toBe(0);
    expect(scoreApiKey(key({ state: "disabled" }), nowMs)).toBe(0);
    expect(scoreApiKey(key({ state: "cooldown", cooldownUntilMs: nowMs + 1 }), nowMs)).toBe(0);
    expect(scoreApiKey(key({ inFlight: 2, maxInFlight: 2 }), nowMs)).toBe(0);
  });

  it("scoreApiKey penalizes rate limits and high latency", () => {
    const healthyScore = scoreApiKey(key({ rateLimit15m: 0, ewmaLatencyMs: 400 }), nowMs);
    const penalizedScore = scoreApiKey(key({ rateLimit15m: 5, ewmaLatencyMs: 3000 }), nowMs);

    expect(healthyScore).toBeGreaterThan(penalizedScore);
    expect(penalizedScore).toBeGreaterThan(0);
  });

  it("scoreApiKey favors lower inFlight, fewer cost-risk failures, and less recent use", () => {
    const lowerInFlightScore = scoreApiKey(key({ inFlight: 0 }), nowMs);
    const higherInFlightScore = scoreApiKey(key({ inFlight: 1 }), nowMs);
    const fewerCostRiskScore = scoreApiKey(key({ costRiskFail15m: 0, consecutiveCostRiskFailures: 0 }), nowMs);
    const moreCostRiskScore = scoreApiKey(key({ costRiskFail15m: 2, consecutiveCostRiskFailures: 1 }), nowMs);
    const lessRecentUseScore = scoreApiKey(key({ lastUsedAtMs: nowMs - 5 * 60_000 }), nowMs);
    const moreRecentUseScore = scoreApiKey(key({ lastUsedAtMs: nowMs - 1_000 }), nowMs);
    const nullLatencyScore = scoreApiKey(key({ ewmaLatencyMs: null }), nowMs);
    const normalLatencyScore = scoreApiKey(key({ ewmaLatencyMs: 1000 }), nowMs);

    expect(lowerInFlightScore).toBeGreaterThan(higherInFlightScore);
    expect(fewerCostRiskScore).toBeGreaterThan(moreCostRiskScore);
    expect(lessRecentUseScore).toBeGreaterThan(moreRecentUseScore);
    expect(nullLatencyScore).toBeGreaterThan(0);
    expect(nullLatencyScore).toBeGreaterThanOrEqual(normalLatencyScore);
  });

  it("pickApiKey does not inspect keys when provider circuit is open", () => {
    const openedProvider = recordApiKeyResult(
      key(),
      provider(),
      {
        kind: "failure",
        classification: classifyProviderError({ status: 524 }),
      },
      nowMs,
    ).provider;

    const dangerousKey = {
      get enabled(): boolean {
        throw new Error("key should not be inspected");
      },
    } as ApiKeyRuntimeState;

    expect(() => pickApiKey([dangerousKey], openedProvider, { nowMs })).toThrowError(ProviderCircuitOpenError);
    expect(() => pickApiKey([dangerousKey], openedProvider, { nowMs })).toThrow(
      "Provider failure may have consumed image-generation cost.",
    );
  });

  it("pickApiKey filters disabled, cooling, and full keys, selecting only available candidates", () => {
    const chosen = pickApiKey(
      [
        key({ id: "disabled", enabled: false }),
        key({ id: "cooling", state: "cooldown", cooldownUntilMs: nowMs + 5_000 }),
        key({ id: "full", inFlight: 2, maxInFlight: 2 }),
        key({ id: "available-low", success15m: 1, success1h: 2, ewmaLatencyMs: 2000 }),
        key({ id: "available-high", success15m: 20, success1h: 50, ewmaLatencyMs: 200 }),
      ],
      provider(),
      { nowMs, random: () => 0.999999 },
    );

    expect(chosen.id).toBe("available-high");
    expect(chosen.inFlight).toBe(1);
    expect(isApiKeyAvailable(chosen, nowMs)).toBe(true);
  });

  it("pickApiKey uses weighted random thresholds instead of always picking first or last", () => {
    const lowWeight = key({ id: "low-weight", success15m: 1, success1h: 1, ewmaLatencyMs: 2000 });
    const highWeight = key({ id: "high-weight", success15m: 20, success1h: 60, ewmaLatencyMs: 100 });

    const firstBucket = pickApiKey([lowWeight, highWeight], provider(), { nowMs, random: () => 0 });
    const lastBucket = pickApiKey([lowWeight, highWeight], provider(), { nowMs, random: () => 0.999 });

    expect(firstBucket.id).toBe("low-weight");
    expect(lastBucket.id).toBe("high-weight");
  });

  it("pickApiKey throws NoAvailableApiKeyError when no key is available", () => {
    expect(() =>
      pickApiKey(
        [
          key({ enabled: false }),
          key({ state: "cooldown", cooldownUntilMs: nowMs + 5_000 }),
          key({ inFlight: 2, maxInFlight: 2 }),
        ],
        provider(),
        { nowMs },
      ),
    ).toThrowError(NoAvailableApiKeyError);
  });

  it("recordApiKeyResult disables a key on 401/403 without opening provider circuit", () => {
    const result = recordApiKeyResult(
      key({ inFlight: 1 }),
      provider(),
      {
        kind: "failure",
        classification: classifyProviderError({ status: 401 }),
      },
      nowMs,
    );

    expect(result.key).toMatchObject({
      enabled: false,
      state: "disabled",
      cooldownUntilMs: null,
      inFlight: 0,
      fail15m: 2,
      fail1h: 3,
      consecutiveFailures: 1,
      lastUsedAtMs: nowMs,
    });
    expect(canUseProvider(result.provider, nowMs, "user")).toMatchObject({
      allowed: true,
      state: "closed",
      reason: null,
    });
  });

  it("recordApiKeyResult cools only the key on 429 and does not open provider circuit", () => {
    const result = recordApiKeyResult(
      key({ inFlight: 1 }),
      provider(),
      {
        kind: "failure",
        classification: classifyProviderError({ status: 429 }),
      },
      nowMs,
    );

    expect(result.key).toMatchObject({
      state: "cooldown",
      cooldownUntilMs: nowMs + 2 * 60 * 1000,
      inFlight: 0,
      rateLimit15m: 1,
      consecutiveFailures: 1,
    });
    expect(canUseProvider(result.provider, nowMs, "user").allowed).toBe(true);
  });

  it("recordApiKeyResult routes half-open ordinary failures through provider circuit state", () => {
    const opened = recordProviderFailure(provider(), classifyProviderError({ status: 524 }), nowMs);
    const probing = reserveProviderProbe(opened, nowMs + 5 * 60 * 1000 + 1, "health_probe");

    const result = recordApiKeyResult(
      key({ inFlight: 1 }),
      probing,
      {
        kind: "failure",
        classification: classifyProviderError({ kind: "network" }),
      },
      nowMs + 5 * 60 * 1000 + 2,
    );

    expect(result.provider).toMatchObject({
      state: "open",
      openUntilMs: nowMs + 10 * 60 * 1000 + 2,
      halfOpenProbeInFlight: false,
      consecutiveCostRiskFailures: 1,
      lastFailureReason: "Network failure prevented the provider request from completing.",
    });
  });

  it("recordApiKeyResult keeps provider half-open for key-local auth failures while disabling the key", () => {
    const opened = recordProviderFailure(provider(), classifyProviderError({ status: 524 }), nowMs);
    const probing = reserveProviderProbe(opened, nowMs + 5 * 60 * 1000 + 1, "health_probe");

    const result = recordApiKeyResult(
      key({ inFlight: 1 }),
      probing,
      {
        kind: "failure",
        classification: classifyProviderError({ status: 401 }),
      },
      nowMs + 5 * 60 * 1000 + 2,
    );

    expect(result.key).toMatchObject({
      enabled: false,
      state: "disabled",
      cooldownUntilMs: null,
      inFlight: 0,
      fail15m: 2,
      fail1h: 3,
      consecutiveFailures: 1,
      lastUsedAtMs: nowMs + 5 * 60 * 1000 + 2,
    });
    expect(result.provider).toMatchObject({
      state: "half_open",
      openUntilMs: null,
      halfOpenProbeInFlight: false,
      consecutiveCostRiskFailures: 1,
      lastFailureReason: "Provider rejected authentication with HTTP 401.",
    });
  });

  it("recordApiKeyResult keeps provider half-open for key-local rate limits while cooling the key", () => {
    const opened = recordProviderFailure(provider(), classifyProviderError({ status: 524 }), nowMs);
    const probing = reserveProviderProbe(opened, nowMs + 5 * 60 * 1000 + 1, "health_probe");

    const result = recordApiKeyResult(
      key({ inFlight: 1 }),
      probing,
      {
        kind: "failure",
        classification: classifyProviderError({ status: 429 }),
      },
      nowMs + 5 * 60 * 1000 + 2,
    );

    expect(result.key).toMatchObject({
      state: "cooldown",
      cooldownUntilMs: nowMs + 7 * 60 * 1000 + 2,
      inFlight: 0,
      rateLimit15m: 1,
      consecutiveFailures: 1,
    });
    expect(result.provider).toMatchObject({
      state: "half_open",
      openUntilMs: null,
      halfOpenProbeInFlight: false,
      consecutiveCostRiskFailures: 1,
      lastFailureReason: "Provider rate-limited the API key.",
    });
  });

  it("recordApiKeyResult opens supplier circuit when one key receives cost-risk failure", () => {
    const result = recordApiKeyResult(
      key({ inFlight: 1 }),
      provider(),
      {
        kind: "failure",
        classification: classifyProviderError({ message: "openai_error" }),
      },
      nowMs,
    );

    expect(result.key).toMatchObject({
      state: "cooldown",
      cooldownUntilMs: nowMs + 5 * 60 * 1000,
      inFlight: 0,
      costRiskFail15m: 1,
      consecutiveFailures: 1,
      consecutiveCostRiskFailures: 1,
    });
    expect(canUseProvider(result.provider, nowMs, "user")).toMatchObject({
      allowed: false,
      state: "open",
      reason: "Provider failure may have consumed image-generation cost.",
      openUntilMs: nowMs + 5 * 60 * 1000,
    });
  });

  it("recordApiKeyResult cools the key after three ordinary failures without opening provider circuit", () => {
    const result = recordApiKeyResult(
      key({
        inFlight: 1,
        consecutiveFailures: 2,
      }),
      provider(),
      {
        kind: "failure",
        classification: classifyProviderError({ message: "ordinary failure" }),
      },
      nowMs,
    );

    expect(result.key).toMatchObject({
      state: "cooldown",
      cooldownUntilMs: nowMs + 60_000,
      inFlight: 0,
      consecutiveFailures: 3,
      lastUsedAtMs: nowMs,
    });
    expect(result.provider).toMatchObject({
      state: "closed",
      halfOpenProbeInFlight: false,
      lastFailureReason: "Provider failure did not match a known classification rule.",
    });
    expect(canUseProvider(result.provider, nowMs, "user")).toMatchObject({
      allowed: true,
      state: "closed",
      reason: null,
    });
  });

  it("recordApiKeyResult records success and clears consecutive failure counters", () => {
    const result = recordApiKeyResult(
      key({
        inFlight: 1,
        state: "cooldown",
        cooldownUntilMs: nowMs + 10_000,
        consecutiveFailures: 3,
        consecutiveCostRiskFailures: 2,
        fail15m: 4,
        fail1h: 7,
        success15m: 0,
        success1h: 3,
        ewmaLatencyMs: null,
      }),
      provider(),
      {
        kind: "success",
        latencyMs: 200,
      },
      nowMs,
    );

    expect(result.key).toMatchObject({
      state: "healthy",
      cooldownUntilMs: null,
      inFlight: 0,
      success15m: 1,
      success1h: 4,
      consecutiveFailures: 0,
      consecutiveCostRiskFailures: 0,
      lastUsedAtMs: nowMs,
    });
    expect(result.key.ewmaLatencyMs).toBe(200);
    expect(canUseProvider(result.provider, nowMs, "user")).toMatchObject({
      allowed: true,
      state: "closed",
      reason: null,
    });
  });

  it("recordApiKeyResult preserves a disabled key on success instead of re-enabling it", () => {
    const result = recordApiKeyResult(
      key({
        enabled: false,
        state: "disabled",
        inFlight: 1,
        success15m: 2,
        success1h: 5,
      }),
      provider(),
      {
        kind: "success",
        latencyMs: 300,
      },
      nowMs,
    );

    expect(result.key).toMatchObject({
      enabled: false,
      state: "disabled",
      cooldownUntilMs: null,
      inFlight: 0,
      success15m: 3,
      success1h: 6,
    });
  });

  it("recordApiKeyResult keeps an open provider circuit open after another key succeeds", () => {
    const openedProvider = recordApiKeyResult(
      key({ inFlight: 1 }),
      provider(),
      {
        kind: "failure",
        classification: classifyProviderError({ status: 524 }),
      },
      nowMs,
    ).provider;

    const result = recordApiKeyResult(
      key({
        id: "other-key",
        inFlight: 1,
        consecutiveFailures: 2,
        consecutiveCostRiskFailures: 1,
      }),
      openedProvider,
      {
        kind: "success",
        latencyMs: 250,
      },
      nowMs + 1_000,
    );

    expect(result.provider).toMatchObject({
      state: "open",
      openUntilMs: openedProvider.openUntilMs,
      lastFailureReason: openedProvider.lastFailureReason,
      consecutiveCostRiskFailures: openedProvider.consecutiveCostRiskFailures,
    });
  });
});
