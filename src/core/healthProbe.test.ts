import { describe, expect, it } from "vitest";

import type { ApiKeyRuntimeState } from "./apiKeyRouter";
import { createProviderCircuit, recordProviderFailure, ProviderCircuitOpenError } from "./providerCircuit";
import { classifyProviderError } from "./providerErrors";
import { createHealthProbeAttempt, shouldRunScheduledHealthProbe } from "./healthProbe";

const nowMs = Date.UTC(2026, 4, 2, 12, 0, 0);
const cooldownMs = 5 * 60 * 1000;

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
    cooldownMs,
  });
}

describe("healthProbe", () => {
  it("allows scheduled baseline probes while the supplier circuit is closed", () => {
    expect(shouldRunScheduledHealthProbe(provider(), nowMs)).toBe(true);
  });

  it("skips scheduled probes while the supplier circuit is still open", () => {
    const opened = recordProviderFailure(provider(), classifyProviderError({ status: 524 }), nowMs);

    expect(shouldRunScheduledHealthProbe(opened, nowMs)).toBe(false);
    expect(shouldRunScheduledHealthProbe(opened, nowMs + cooldownMs - 1)).toBe(false);
  });

  it("allows one half-open probe after cooldown expiry and blocks a second attempt", () => {
    const opened = recordProviderFailure(provider(), classifyProviderError({ status: 524 }), nowMs);
    const afterCooldown = nowMs + cooldownMs + 1;

    expect(shouldRunScheduledHealthProbe(opened, afterCooldown)).toBe(true);

    const attempt = createHealthProbeAttempt([key()], opened, afterCooldown);

    expect(attempt.provider.state).toBe("half_open");
    expect(attempt.provider.halfOpenProbeInFlight).toBe(true);
    expect(() => createHealthProbeAttempt([key()], attempt.provider, afterCooldown)).toThrow(ProviderCircuitOpenError);
  });

  it("blocks an immediate second probe after a half-open probe failure reopens the circuit", () => {
    const opened = recordProviderFailure(provider(), classifyProviderError({ status: 524 }), nowMs);
    const afterCooldown = nowMs + cooldownMs + 1;
    const attempt = createHealthProbeAttempt([key()], opened, afterCooldown);
    const reopened = recordProviderFailure(
      attempt.provider,
      classifyProviderError({ kind: "network" }),
      afterCooldown + 1,
    );

    expect(reopened).toMatchObject({
      state: "open",
      openUntilMs: afterCooldown + 1 + cooldownMs,
      halfOpenProbeInFlight: false,
    });
    expect(() => createHealthProbeAttempt([key()], reopened, afterCooldown + 2)).toThrow(ProviderCircuitOpenError);
  });

  it("selects the least-used available key instead of probing all keys", () => {
    const attempt = createHealthProbeAttempt(
      [
        key({ id: "higher-usage", success1h: 15, fail1h: 5, inFlight: 1, lastUsedAtMs: nowMs - 300_000 }),
        key({ id: "least-used", success1h: 1, fail1h: 0, inFlight: 0, lastUsedAtMs: nowMs - 120_000 }),
        key({ id: "middle-usage", success1h: 3, fail1h: 1, inFlight: 0, lastUsedAtMs: nowMs - 240_000 }),
      ],
      provider(),
      nowMs,
    );

    expect(attempt.key.id).toBe("least-used");
    expect(attempt.key.inFlight).toBe(1);
  });

  it("excludes disabled, cooldown, and full keys", () => {
    const attempt = createHealthProbeAttempt(
      [
        key({ id: "disabled", enabled: false }),
        key({ id: "cooldown", state: "cooldown", cooldownUntilMs: nowMs + 10_000 }),
        key({ id: "full", inFlight: 2, maxInFlight: 2 }),
        key({ id: "available", success1h: 2, fail1h: 0, inFlight: 0 }),
      ],
      provider(),
      nowMs,
    );

    expect(attempt.key.id).toBe("available");
  });

  it("throws ProviderCircuitOpenError when no key is available", () => {
    const attempt = () =>
      createHealthProbeAttempt(
        [
          key({ enabled: false }),
          key({ state: "cooldown", cooldownUntilMs: nowMs + 10_000 }),
          key({ inFlight: 2, maxInFlight: 2 }),
        ],
        provider(),
        nowMs,
      );

    let capturedError: unknown;
    try {
      attempt();
    } catch (error) {
      capturedError = error;
    }

    expect(capturedError).toBeInstanceOf(ProviderCircuitOpenError);
    expect(capturedError).toHaveProperty("message", "No hosted API key is currently available for health probes.");
  });

  it("prefers never-used keys when usage is tied", () => {
    const attempt = createHealthProbeAttempt(
      [
        key({ id: "recently-used", success1h: 1, fail1h: 0, inFlight: 0, lastUsedAtMs: nowMs - 5_000 }),
        key({ id: "never-used", success1h: 1, fail1h: 0, inFlight: 0, lastUsedAtMs: null }),
      ],
      provider(),
      nowMs,
    );

    expect(attempt.key.id).toBe("never-used");
  });
});
