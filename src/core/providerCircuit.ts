import type { ProviderErrorClassification } from "./providerErrors";

export type ProviderCircuitState = "closed" | "open" | "half_open";
export type ProviderCircuitActor = "user" | "health_probe" | "admin_probe";

export type ProviderCircuit = {
  providerId: string;
  baseUrl: string;
  imageModel: string;
  state: ProviderCircuitState;
  openedAtMs: number | null;
  openUntilMs: number | null;
  cooldownMs: number;
  halfOpenProbeInFlight: boolean;
  consecutiveCostRiskFailures: number;
  lastFailureReason: string | null;
};

export type CreateProviderCircuitInput = {
  providerId: string;
  baseUrl: string;
  imageModel: string;
  nowMs: number;
  cooldownMs?: number;
};

export type ProviderAvailability = {
  allowed: boolean;
  state: ProviderCircuitState;
  reason: string | null;
  openUntilMs: number | null;
};

export class ProviderCircuitOpenError extends Error {
  constructor(message = "Provider circuit is open.") {
    super(message);
    this.name = "ProviderCircuitOpenError";
  }
}

const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;

export function createProviderCircuit(input: CreateProviderCircuitInput): ProviderCircuit {
  void input.nowMs;

  return {
    providerId: input.providerId,
    baseUrl: input.baseUrl,
    imageModel: input.imageModel,
    state: "closed",
    openedAtMs: null,
    openUntilMs: null,
    cooldownMs: input.cooldownMs ?? DEFAULT_COOLDOWN_MS,
    halfOpenProbeInFlight: false,
    consecutiveCostRiskFailures: 0,
    lastFailureReason: null,
  };
}

export function getEffectiveProviderCircuit(circuit: ProviderCircuit, nowMs: number): ProviderCircuit {
  if (circuit.state !== "open") {
    return circuit;
  }

  if (circuit.openUntilMs === null || nowMs < circuit.openUntilMs) {
    return circuit;
  }

  return {
    ...circuit,
    state: "half_open",
    openedAtMs: null,
    openUntilMs: null,
    halfOpenProbeInFlight: false,
  };
}

export function canUseProvider(
  circuit: ProviderCircuit,
  nowMs: number,
  actor: ProviderCircuitActor,
): ProviderAvailability {
  const effectiveCircuit = getEffectiveProviderCircuit(circuit, nowMs);

  if (effectiveCircuit.state === "closed") {
    return { allowed: true, state: "closed", reason: null, openUntilMs: null };
  }

  if (effectiveCircuit.state === "open") {
    const reason = effectiveCircuit.lastFailureReason ?? "provider circuit is open";

    return {
      allowed: actor === "admin_probe",
      state: "open",
      reason: actor === "admin_probe" ? null : reason,
      openUntilMs: effectiveCircuit.openUntilMs,
    };
  }

  const allowed = (actor === "health_probe" || actor === "admin_probe") && !effectiveCircuit.halfOpenProbeInFlight;
  return {
    allowed,
    state: "half_open",
    reason: allowed ? null : "provider circuit is half-open",
    openUntilMs: null,
  };
}

export function reserveProviderProbe(
  circuit: ProviderCircuit,
  nowMs: number,
  actor: Extract<ProviderCircuitActor, "health_probe" | "admin_probe">,
): ProviderCircuit;
export function reserveProviderProbe(
  circuit: ProviderCircuit,
  nowMs: number,
  actor: ProviderCircuitActor,
): ProviderCircuit {
  const effectiveCircuit = getEffectiveProviderCircuit(circuit, nowMs);

  if (actor === "user") {
    throw new ProviderCircuitOpenError("User actors cannot reserve provider probes.");
  }

  if (effectiveCircuit.state === "open") {
    if (actor !== "admin_probe") {
      throw new ProviderCircuitOpenError();
    }

    return effectiveCircuit;
  }

  if (effectiveCircuit.state === "half_open") {
    if (effectiveCircuit.halfOpenProbeInFlight) {
      throw new ProviderCircuitOpenError();
    }

    return {
      ...effectiveCircuit,
      halfOpenProbeInFlight: true,
    };
  }

  throw new ProviderCircuitOpenError("Provider circuit is closed and does not need a probe.");
}

export function recordProviderSuccess(circuit: ProviderCircuit, nowMs: number): ProviderCircuit {
  void nowMs;

  return {
    ...circuit,
    state: "closed",
    openedAtMs: null,
    openUntilMs: null,
    halfOpenProbeInFlight: false,
    consecutiveCostRiskFailures: 0,
    lastFailureReason: null,
  };
}

export function recordProviderFailure(
  circuit: ProviderCircuit,
  classification: ProviderErrorClassification,
  nowMs: number,
): ProviderCircuit {
  const baseCircuit = getEffectiveProviderCircuit(circuit, nowMs);
  const nextConsecutiveCostRiskFailures = classification.shouldOpenProviderCircuit
    ? baseCircuit.consecutiveCostRiskFailures + 1
    : baseCircuit.consecutiveCostRiskFailures;
  const isKeyLocalHalfOpenFailure = classification.category === "auth" || classification.category === "rate_limit";

  if (baseCircuit.state === "half_open") {
    if (isKeyLocalHalfOpenFailure) {
      return {
        ...baseCircuit,
        halfOpenProbeInFlight: false,
        consecutiveCostRiskFailures: nextConsecutiveCostRiskFailures,
        lastFailureReason: classification.reason,
      };
    }

    return {
      ...baseCircuit,
      state: "open",
      openedAtMs: nowMs,
      openUntilMs: nowMs + baseCircuit.cooldownMs,
      halfOpenProbeInFlight: false,
      consecutiveCostRiskFailures: nextConsecutiveCostRiskFailures,
      lastFailureReason: classification.reason,
    };
  }

  if (!classification.shouldOpenProviderCircuit) {
    return {
      ...baseCircuit,
      halfOpenProbeInFlight: false,
      lastFailureReason: classification.reason,
    };
  }

  return {
    ...baseCircuit,
    state: "open",
    openedAtMs: nowMs,
    openUntilMs: nowMs + baseCircuit.cooldownMs,
    halfOpenProbeInFlight: false,
    consecutiveCostRiskFailures: nextConsecutiveCostRiskFailures,
    lastFailureReason: classification.reason,
  };
}
