import { describe, expect, it } from "vitest";

import { classifyProviderError } from "./providerErrors";
import {
  ProviderCircuitOpenError,
  canUseProvider,
  createProviderCircuit,
  recordProviderFailure,
  recordProviderSuccess,
  reserveProviderProbe,
} from "./providerCircuit";

const nowMs = Date.UTC(2026, 4, 2, 12, 0, 0);
const cooldownMs = 5 * 60 * 1000;

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
    expect(canUseProvider(opened, nowMs, "user")).toMatchObject({ allowed: false, state: "open" });
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

    expect(canUseProvider(opened, nowMs, "user").allowed).toBe(false);
    expect(canUseProvider(opened, nowMs, "admin_probe").allowed).toBe(true);
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
    expect(canUseProvider(next, nowMs, "user").allowed).toBe(true);
  });
});
