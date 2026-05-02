import { describe, expect, it } from "vitest";

import { classifyProviderError } from "./providerErrors";
import {
  type ProviderCircuit,
  type ProviderCircuitActor,
  ProviderCircuitOpenError,
  canUseProvider,
  createProviderCircuit,
  getEffectiveProviderCircuit,
  recordProviderFailure,
  recordProviderSuccess,
  reserveProviderProbe,
} from "./providerCircuit";

const nowMs = Date.UTC(2026, 4, 2, 12, 0, 0);
const cooldownMs = 5 * 60 * 1000;
const unsafeReserveProviderProbe = reserveProviderProbe as (
  circuit: ProviderCircuit,
  nowMs: number,
  actor: ProviderCircuitActor,
) => ProviderCircuit;

describe("provider circuit", () => {
  it("opens immediately for one cost-risk failure", () => {
    const circuit = createProviderCircuit({
      providerId: "ruoli",
      baseUrl: "https://ruoli.dev/v1",
      imageModel: "gpt-image-2",
      nowMs,
      cooldownMs,
    });

    const opened = recordProviderFailure(circuit, classifyProviderError({ status: 524 }), nowMs);

    expect(opened.state).toBe("open");
    expect(opened.openUntilMs).toBe(nowMs + cooldownMs);
    expect(opened.consecutiveCostRiskFailures).toBe(1);
    expect(canUseProvider(opened, nowMs, "user")).toMatchObject({
      allowed: false,
      state: "open",
      reason: "Provider failure may have consumed image-generation cost.",
      openUntilMs: nowMs + cooldownMs,
    });
  });

  it("allows admin probe during open circuit without allowing normal users", () => {
    const opened = recordProviderFailure(
      createProviderCircuit({
        providerId: "ruoli",
        baseUrl: "https://ruoli.dev/v1",
        imageModel: "gpt-image-2",
        nowMs,
      }),
      classifyProviderError({ message: "openai_error" }),
      nowMs,
    );

    expect(canUseProvider(opened, nowMs, "user")).toMatchObject({
      allowed: false,
      state: "open",
      reason: "Provider failure may have consumed image-generation cost.",
      openUntilMs: nowMs + cooldownMs,
    });
    expect(canUseProvider(opened, nowMs, "admin_probe")).toMatchObject({
      allowed: true,
      state: "open",
      reason: null,
      openUntilMs: nowMs + cooldownMs,
    });
  });

  it("lets an admin reserve a probe while the circuit is still open without changing state", () => {
    const opened = recordProviderFailure(
      createProviderCircuit({
        providerId: "ruoli",
        baseUrl: "https://ruoli.dev/v1",
        imageModel: "gpt-image-2",
        nowMs,
      }),
      classifyProviderError({ status: 524 }),
      nowMs,
    );

    expect(() => reserveProviderProbe(opened, nowMs, "admin_probe")).not.toThrow();
    expect(reserveProviderProbe(opened, nowMs, "admin_probe")).toMatchObject({
      state: "open",
      openUntilMs: nowMs + cooldownMs,
      halfOpenProbeInFlight: false,
    });
  });

  it("moves to half_open after the open window expires and allows one probe", () => {
    const opened = recordProviderFailure(
      createProviderCircuit({
        providerId: "ruoli",
        baseUrl: "https://ruoli.dev/v1",
        imageModel: "gpt-image-2",
        nowMs,
      }),
      classifyProviderError({ status: 524 }),
      nowMs,
    );

    const afterCooldown = nowMs + cooldownMs + 1;
    const firstProbe = reserveProviderProbe(opened, afterCooldown, "health_probe");

    expect(firstProbe.state).toBe("half_open");
    expect(firstProbe.halfOpenProbeInFlight).toBe(true);
    expect(() => reserveProviderProbe(firstProbe, afterCooldown, "health_probe")).toThrow(ProviderCircuitOpenError);
  });

  it("reopens a half-open circuit after a non-opening failure", () => {
    const opened = recordProviderFailure(
      createProviderCircuit({
        providerId: "ruoli",
        baseUrl: "https://ruoli.dev/v1",
        imageModel: "gpt-image-2",
        nowMs,
      }),
      classifyProviderError({ status: 524 }),
      nowMs,
    );
    const probing = reserveProviderProbe(opened, nowMs + cooldownMs + 1, "health_probe");

    const failureAtMs = nowMs + cooldownMs + 2;
    const next = recordProviderFailure(probing, classifyProviderError({ kind: "network" }), failureAtMs);

    expect(next).toMatchObject({
      state: "open",
      openedAtMs: failureAtMs,
      openUntilMs: failureAtMs + cooldownMs,
      halfOpenProbeInFlight: false,
      consecutiveCostRiskFailures: 1,
      lastFailureReason: "Network failure prevented the provider request from completing.",
    });
  });

  it("keeps a half-open circuit half-open after an auth failure", () => {
    const opened = recordProviderFailure(
      createProviderCircuit({
        providerId: "ruoli",
        baseUrl: "https://ruoli.dev/v1",
        imageModel: "gpt-image-2",
        nowMs,
      }),
      classifyProviderError({ status: 524 }),
      nowMs,
    );
    const probing = reserveProviderProbe(opened, nowMs + cooldownMs + 1, "health_probe");

    const failureAtMs = nowMs + cooldownMs + 2;
    const next = recordProviderFailure(probing, classifyProviderError({ status: 401 }), failureAtMs);

    expect(next).toMatchObject({
      state: "half_open",
      openedAtMs: null,
      openUntilMs: null,
      halfOpenProbeInFlight: false,
      consecutiveCostRiskFailures: 1,
      lastFailureReason: "Provider rejected authentication with HTTP 401.",
    });
  });

  it("keeps a half-open circuit half-open after a rate-limit failure", () => {
    const opened = recordProviderFailure(
      createProviderCircuit({
        providerId: "ruoli",
        baseUrl: "https://ruoli.dev/v1",
        imageModel: "gpt-image-2",
        nowMs,
      }),
      classifyProviderError({ status: 524 }),
      nowMs,
    );
    const probing = reserveProviderProbe(opened, nowMs + cooldownMs + 1, "health_probe");

    const failureAtMs = nowMs + cooldownMs + 2;
    const next = recordProviderFailure(probing, classifyProviderError({ status: 429 }), failureAtMs);

    expect(next).toMatchObject({
      state: "half_open",
      openedAtMs: null,
      openUntilMs: null,
      halfOpenProbeInFlight: false,
      consecutiveCostRiskFailures: 1,
      lastFailureReason: "Provider rate-limited the API key.",
    });
  });

  it("reopens a half-open circuit after an unknown failure and blocks an immediate second probe", () => {
    const opened = recordProviderFailure(
      createProviderCircuit({
        providerId: "ruoli",
        baseUrl: "https://ruoli.dev/v1",
        imageModel: "gpt-image-2",
        nowMs,
      }),
      classifyProviderError({ status: 524 }),
      nowMs,
    );
    const probing = reserveProviderProbe(opened, nowMs + cooldownMs + 1, "health_probe");

    const failureAtMs = nowMs + cooldownMs + 2;
    const next = recordProviderFailure(probing, classifyProviderError({ message: "ordinary failure" }), failureAtMs);

    expect(next).toMatchObject({
      state: "open",
      openedAtMs: failureAtMs,
      openUntilMs: failureAtMs + cooldownMs,
      halfOpenProbeInFlight: false,
      consecutiveCostRiskFailures: 1,
      lastFailureReason: "Provider failure did not match a known classification rule.",
    });
    expect(() => reserveProviderProbe(next, failureAtMs + 1, "health_probe")).toThrow(ProviderCircuitOpenError);
  });

  it("reopens a half-open circuit after a cost-risk failure", () => {
    const opened = recordProviderFailure(
      createProviderCircuit({
        providerId: "ruoli",
        baseUrl: "https://ruoli.dev/v1",
        imageModel: "gpt-image-2",
        nowMs,
      }),
      classifyProviderError({ status: 524 }),
      nowMs,
    );
    const probing = reserveProviderProbe(opened, nowMs + cooldownMs + 1, "health_probe");

    const reopened = recordProviderFailure(probing, classifyProviderError({ message: "openai_error" }), nowMs + cooldownMs + 2);

    expect(reopened).toMatchObject({
      state: "open",
      openUntilMs: nowMs + cooldownMs + 2 + cooldownMs,
      halfOpenProbeInFlight: false,
      consecutiveCostRiskFailures: 2,
      lastFailureReason: "Provider failure may have consumed image-generation cost.",
    });
  });

  it("rejects user actors at runtime when reserving a probe", () => {
    const opened = recordProviderFailure(
      createProviderCircuit({
        providerId: "ruoli",
        baseUrl: "https://ruoli.dev/v1",
        imageModel: "gpt-image-2",
        nowMs,
      }),
      classifyProviderError({ status: 524 }),
      nowMs,
    );
    const halfOpen = getEffectiveProviderCircuit(opened, nowMs + cooldownMs + 1);

    expect(halfOpen.state).toBe("half_open");
    expect(() => unsafeReserveProviderProbe(halfOpen, nowMs + cooldownMs + 1, "user")).toThrow(
      ProviderCircuitOpenError,
    );
  });

  it("closes after a successful half-open probe", () => {
    const opened = recordProviderFailure(
      createProviderCircuit({
        providerId: "ruoli",
        baseUrl: "https://ruoli.dev/v1",
        imageModel: "gpt-image-2",
        nowMs,
      }),
      classifyProviderError({ status: 524 }),
      nowMs,
    );
    const probing = reserveProviderProbe(opened, nowMs + cooldownMs + 1, "health_probe");

    const closed = recordProviderSuccess(probing, nowMs + cooldownMs + 1000);

    expect(closed).toMatchObject({
      state: "closed",
      openUntilMs: null,
      halfOpenProbeInFlight: false,
      consecutiveCostRiskFailures: 0,
      lastFailureReason: null,
    });
  });

  it("keeps the circuit closed for ordinary network failures", () => {
    const circuit = createProviderCircuit({
      providerId: "ruoli",
      baseUrl: "https://ruoli.dev/v1",
      imageModel: "gpt-image-2",
      nowMs,
    });

    const next = recordProviderFailure(circuit, classifyProviderError({ kind: "network" }), nowMs);

    expect(next.state).toBe("closed");
    expect(canUseProvider(next, nowMs, "user")).toMatchObject({
      allowed: true,
      state: "closed",
      reason: null,
      openUntilMs: null,
    });
  });
});
