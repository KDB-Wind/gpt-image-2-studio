# Web Platform Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first reusable TypeScript core for the future Web image platform: provider error classification, supplier-level circuit breaking, API key routing, health probe guarding, and billing decisions.

**Architecture:** Keep the current Vite/Tauri desktop app unchanged and add dependency-free platform domain modules under `src/core`. These modules are pure TypeScript so they can be reused by the future `apps/api` and `apps/worker` services without pulling React, Tauri, database, or queue dependencies into the first slice.

**Tech Stack:** TypeScript, Vitest, current Vite test runner, existing `src/core` module style.

---

## Scope

This Phase 1 plan deliberately implements only the cost-protection and routing core required by the Web platform MVP. It does not create accounts, database tables, Redis queues, email login, payments, admin UI, or prompt template pages. Those features depend on these core rules and should be planned as separate phases after this slice is green.

Critical rule for this phase: the 10 hosted API keys share the same supplier and `Base URL`. If one key receives a high-cost-risk image failure, the supplier/model circuit opens immediately and the system must not test or route work to the other 9 keys during the circuit window.

## File Structure

- Create `src/core/providerErrors.ts`: classifies provider/API failures into auth, rate-limit, timeout, network, validation, cost-risk, and unknown categories.
- Create `src/core/providerErrors.test.ts`: covers HTTP 524, `openai_error`, `bad_response_status_code`, structured error payloads, and no-image-data responses.
- Create `src/core/providerCircuit.ts`: owns supplier/model circuit state transitions for `closed`, `open`, and `half_open`.
- Create `src/core/providerCircuit.test.ts`: verifies immediate 5-minute circuit opening, normal-user blocking, one half-open probe, admin probe allowance, and recovery.
- Create `src/core/apiKeyRouter.ts`: scores and selects hosted API keys only when the supplier circuit allows it; records success/failure outcomes.
- Create `src/core/apiKeyRouter.test.ts`: verifies disabled/cooldown/full-key filtering, weighted selection, 401/403 disable, 429 key cooldown only, and cost-risk provider circuit opening.
- Create `src/core/healthProbe.ts`: selects exactly one probe key and prevents scheduled checks from multiplying cost while the supplier circuit is open.
- Create `src/core/healthProbe.test.ts`: verifies one-key probing and no fan-out across all 10 keys.
- Create `src/core/generationPolicy.ts`: converts generation outcomes into credit ledger decisions.
- Create `src/core/generationPolicy.test.ts`: verifies success debit and no-charge outcomes for provider failures and circuit-open states.
- Create `src/core/platformCore.ts`: exports the new platform core modules from one stable entry point.
- Create `src/core/platformCore.test.ts`: end-to-end pure-domain regression for "one key fails, supplier opens, no other key is selected".

## Task 1: Provider Error Classification

**Files:**
- Create: `src/core/providerErrors.ts`
- Test: `src/core/providerErrors.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/core/providerErrors.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  classifyProviderError,
  isCostRiskProviderError,
  type ProviderErrorInput,
} from "./providerErrors";

describe("classifyProviderError", () => {
  it("treats HTTP 524 as a cost-risk provider failure", () => {
    const result = classifyProviderError({
      status: 524,
      responseBody:
        '{"error":{"message":"openai_error","type":"bad_response_status_code","code":"bad_response_status_code"}}',
    });

    expect(result.category).toBe("cost_risk");
    expect(result.shouldOpenProviderCircuit).toBe(true);
    expect(result.shouldDisableApiKey).toBe(false);
    expect(result.userChargeable).toBe(false);
  });

  it("treats openai_error markers as cost-risk even without status", () => {
    expect(
      classifyProviderError({
        message: "Request failed: openai_error",
      }).category,
    ).toBe("cost_risk");
  });

  it("treats bad_response_status_code markers as cost-risk", () => {
    expect(
      classifyProviderError({
        code: "bad_response_status_code",
      }).shouldOpenProviderCircuit,
    ).toBe(true);
  });

  it("treats missing image data as cost-risk because the provider may have charged", () => {
    expect(
      classifyProviderError({
        message: "Image generation response did not contain any image data.",
      }),
    ).toMatchObject({
      category: "cost_risk",
      shouldOpenProviderCircuit: true,
      userChargeable: false,
    });
  });

  it("treats structured 200 error payloads as cost-risk for image generation", () => {
    const input: ProviderErrorInput = {
      status: 200,
      payload: {
        error: {
          message: "openai_error",
          type: "bad_response_status_code",
          code: "bad_response_status_code",
        },
      },
    };

    expect(isCostRiskProviderError(input)).toBe(true);
  });

  it("classifies auth errors as key-disabling errors only", () => {
    expect(classifyProviderError({ status: 401 }).category).toBe("auth");
    expect(classifyProviderError({ status: 403 }).shouldDisableApiKey).toBe(true);
    expect(classifyProviderError({ status: 403 }).shouldOpenProviderCircuit).toBe(false);
  });

  it("classifies 429 as key cooldown and not provider circuit", () => {
    expect(classifyProviderError({ status: 429 })).toMatchObject({
      category: "rate_limit",
      shouldCooldownApiKey: true,
      shouldOpenProviderCircuit: false,
      userChargeable: false,
    });
  });

  it("classifies timeout and network failures without opening the supplier circuit", () => {
    expect(classifyProviderError({ kind: "timeout" })).toMatchObject({
      category: "timeout",
      shouldOpenProviderCircuit: false,
    });
    expect(classifyProviderError({ kind: "network" })).toMatchObject({
      category: "network",
      shouldOpenProviderCircuit: false,
    });
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
npm run test:run -- src/core/providerErrors.test.ts
```

Expected: FAIL because `src/core/providerErrors.ts` does not exist.

- [ ] **Step 3: Implement the classifier**

Create `src/core/providerErrors.ts`:

```ts
export type ProviderErrorCategory =
  | "auth"
  | "rate_limit"
  | "timeout"
  | "network"
  | "validation"
  | "cost_risk"
  | "unknown";

export type ProviderTransportKind = "timeout" | "network" | "http" | "parse";

export type ProviderErrorInput = {
  status?: number;
  kind?: ProviderTransportKind;
  message?: string;
  code?: string;
  type?: string;
  responseBody?: string;
  payload?: unknown;
};

export type ProviderErrorClassification = {
  category: ProviderErrorCategory;
  reason: string;
  shouldOpenProviderCircuit: boolean;
  shouldCooldownApiKey: boolean;
  shouldDisableApiKey: boolean;
  userChargeable: boolean;
};

const COST_RISK_MARKERS = [
  "openai_error",
  "bad_response_status_code",
  "did not contain any image data",
  "no image data",
  "empty image response",
];

export function classifyProviderError(input: ProviderErrorInput): ProviderErrorClassification {
  const status = input.status;
  const text = collectSearchableText(input);

  if (status === 401 || status === 403) {
    return {
      category: "auth",
      reason: `HTTP ${status} authentication failure`,
      shouldOpenProviderCircuit: false,
      shouldCooldownApiKey: false,
      shouldDisableApiKey: true,
      userChargeable: false,
    };
  }

  if (status === 429) {
    return {
      category: "rate_limit",
      reason: "HTTP 429 rate limit",
      shouldOpenProviderCircuit: false,
      shouldCooldownApiKey: true,
      shouldDisableApiKey: false,
      userChargeable: false,
    };
  }

  if (input.kind === "timeout" || status === 408) {
    return {
      category: "timeout",
      reason: "Request timed out",
      shouldOpenProviderCircuit: false,
      shouldCooldownApiKey: false,
      shouldDisableApiKey: false,
      userChargeable: false,
    };
  }

  if (input.kind === "network") {
    return {
      category: "network",
      reason: "Network failure",
      shouldOpenProviderCircuit: false,
      shouldCooldownApiKey: false,
      shouldDisableApiKey: false,
      userChargeable: false,
    };
  }

  if (status === 400 && !hasCostRiskMarker(text)) {
    return {
      category: "validation",
      reason: "Provider rejected the request",
      shouldOpenProviderCircuit: false,
      shouldCooldownApiKey: false,
      shouldDisableApiKey: false,
      userChargeable: false,
    };
  }

  if (status === 524 || hasCostRiskMarker(text) || hasStructuredProviderError(input.payload)) {
    return {
      category: "cost_risk",
      reason: status === 524 ? "HTTP 524 provider timeout" : "Provider returned a high-cost-risk image failure",
      shouldOpenProviderCircuit: true,
      shouldCooldownApiKey: true,
      shouldDisableApiKey: false,
      userChargeable: false,
    };
  }

  return {
    category: "unknown",
    reason: "Unclassified provider failure",
    shouldOpenProviderCircuit: false,
    shouldCooldownApiKey: false,
    shouldDisableApiKey: false,
    userChargeable: false,
  };
}

export function isCostRiskProviderError(input: ProviderErrorInput): boolean {
  return classifyProviderError(input).category === "cost_risk";
}

function collectSearchableText(input: ProviderErrorInput): string {
  const chunks = [input.message, input.code, input.type, input.responseBody];
  if (input.payload !== undefined) {
    chunks.push(safeJson(input.payload));
  }

  return chunks.filter(Boolean).join("\n").toLowerCase();
}

function hasCostRiskMarker(text: string): boolean {
  return COST_RISK_MARKERS.some((marker) => text.includes(marker));
}

function hasStructuredProviderError(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const record = payload as Record<string, unknown>;
  if ("error" in record && record.error && typeof record.error === "object") {
    return true;
  }

  return false;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```powershell
npm run test:run -- src/core/providerErrors.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the classifier**

Stage only the new classifier files:

```powershell
git add src/core/providerErrors.ts src/core/providerErrors.test.ts
git commit -m "feat: classify provider image errors"
```

## Task 2: Supplier Circuit State Machine

**Files:**
- Create: `src/core/providerCircuit.ts`
- Test: `src/core/providerCircuit.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/core/providerCircuit.test.ts`:

```ts
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

describe("provider circuit", () => {
  it("opens immediately for one cost-risk failure", () => {
    const circuit = createProviderCircuit({
      providerId: "ruoli",
      baseUrl: "https://ruoli.dev/v1",
      imageModel: "gpt-image-2",
      nowMs,
      cooldownMs: 5 * 60 * 1000,
    });

    const opened = recordProviderFailure(circuit, classifyProviderError({ status: 524 }), nowMs);

    expect(opened.state).toBe("open");
    expect(opened.openUntilMs).toBe(nowMs + 5 * 60 * 1000);
    expect(opened.consecutiveCostRiskFailures).toBe(1);
    expect(canUseProvider(opened, nowMs, "user")).toMatchObject({
      allowed: false,
      state: "open",
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

    const afterCooldown = nowMs + 5 * 60 * 1000 + 1;
    const firstProbe = reserveProviderProbe(opened, afterCooldown, "health_probe");

    expect(firstProbe.state).toBe("half_open");
    expect(firstProbe.halfOpenProbeInFlight).toBe(true);
    expect(() => reserveProviderProbe(firstProbe, afterCooldown, "health_probe")).toThrow(
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
    const probing = reserveProviderProbe(opened, nowMs + 5 * 60 * 1000 + 1, "health_probe");

    const closed = recordProviderSuccess(probing, nowMs + 5 * 60 * 1000 + 1000);

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
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
npm run test:run -- src/core/providerCircuit.test.ts
```

Expected: FAIL because `src/core/providerCircuit.ts` does not exist.

- [ ] **Step 3: Implement the circuit state machine**

Create `src/core/providerCircuit.ts`:

```ts
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

export function canUseProvider(
  circuit: ProviderCircuit,
  nowMs: number,
  actor: ProviderCircuitActor,
): ProviderAvailability {
  const effective = getEffectiveProviderCircuit(circuit, nowMs);

  if (effective.state === "closed") {
    return { allowed: true, state: "closed", reason: null, openUntilMs: null };
  }

  if (effective.state === "open") {
    if (actor === "admin_probe") {
      return {
        allowed: true,
        state: "open",
        reason: "Admin probe is allowed while provider circuit is open.",
        openUntilMs: effective.openUntilMs,
      };
    }

    return {
      allowed: false,
      state: "open",
      reason: effective.lastFailureReason ?? "Provider circuit is open.",
      openUntilMs: effective.openUntilMs,
    };
  }

  if (effective.halfOpenProbeInFlight) {
    return {
      allowed: false,
      state: "half_open",
      reason: "A provider recovery probe is already running.",
      openUntilMs: null,
    };
  }

  return {
    allowed: actor === "health_probe" || actor === "admin_probe",
    state: "half_open",
    reason: actor === "user" ? "Provider is waiting for a recovery probe." : null,
    openUntilMs: null,
  };
}

export function reserveProviderProbe(
  circuit: ProviderCircuit,
  nowMs: number,
  actor: Extract<ProviderCircuitActor, "health_probe" | "admin_probe">,
): ProviderCircuit {
  const availability = canUseProvider(circuit, nowMs, actor);

  if (!availability.allowed) {
    throw new ProviderCircuitOpenError(availability.reason ?? "Provider probe is not allowed.");
  }

  const effective = getEffectiveProviderCircuit(circuit, nowMs);
  if (effective.state === "half_open") {
    return {
      ...effective,
      halfOpenProbeInFlight: true,
    };
  }

  return effective;
}

export function recordProviderSuccess(circuit: ProviderCircuit, nowMs: number): ProviderCircuit {
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
  if (!classification.shouldOpenProviderCircuit) {
    return {
      ...circuit,
      halfOpenProbeInFlight: false,
      lastFailureReason: classification.reason,
    };
  }

  return {
    ...circuit,
    state: "open",
    openedAtMs: nowMs,
    openUntilMs: nowMs + circuit.cooldownMs,
    halfOpenProbeInFlight: false,
    consecutiveCostRiskFailures: circuit.consecutiveCostRiskFailures + 1,
    lastFailureReason: classification.reason,
  };
}

export function getEffectiveProviderCircuit(circuit: ProviderCircuit, nowMs: number): ProviderCircuit {
  if (circuit.state === "open" && circuit.openUntilMs !== null && circuit.openUntilMs <= nowMs) {
    return {
      ...circuit,
      state: "half_open",
      openedAtMs: null,
      openUntilMs: null,
      halfOpenProbeInFlight: false,
    };
  }

  return circuit;
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```powershell
npm run test:run -- src/core/providerCircuit.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the circuit module**

```powershell
git add src/core/providerCircuit.ts src/core/providerCircuit.test.ts
git commit -m "feat: add provider circuit breaker core"
```

## Task 3: Hosted API Key Dynamic Router

**Files:**
- Create: `src/core/apiKeyRouter.ts`
- Test: `src/core/apiKeyRouter.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/core/apiKeyRouter.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { classifyProviderError } from "./providerErrors";
import { createProviderCircuit, recordProviderFailure } from "./providerCircuit";
import {
  NoAvailableApiKeyError,
  pickApiKey,
  recordApiKeyResult,
  scoreApiKey,
  type ApiKeyRuntimeState,
} from "./apiKeyRouter";

const nowMs = Date.UTC(2026, 4, 2, 12, 0, 0);

function provider() {
  return createProviderCircuit({
    providerId: "ruoli",
    baseUrl: "https://ruoli.dev/v1",
    imageModel: "gpt-image-2",
    nowMs,
  });
}

function key(id: string, overrides: Partial<ApiKeyRuntimeState> = {}): ApiKeyRuntimeState {
  return {
    id,
    label: id,
    enabled: true,
    state: "healthy",
    cooldownUntilMs: null,
    inFlight: 0,
    maxInFlight: 1,
    success15m: 5,
    fail15m: 0,
    costRiskFail15m: 0,
    rateLimit15m: 0,
    success1h: 20,
    fail1h: 0,
    consecutiveFailures: 0,
    consecutiveCostRiskFailures: 0,
    ewmaLatencyMs: 120_000,
    lastUsedAtMs: null,
    ...overrides,
  };
}

describe("scoreApiKey", () => {
  it("scores disabled, cooling, and full keys as unavailable", () => {
    expect(scoreApiKey(key("disabled", { enabled: false }), nowMs)).toBe(0);
    expect(scoreApiKey(key("cooldown", { state: "cooldown", cooldownUntilMs: nowMs + 1 }), nowMs)).toBe(0);
    expect(scoreApiKey(key("full", { inFlight: 1, maxInFlight: 1 }), nowMs)).toBe(0);
  });

  it("penalizes rate limits and high latency", () => {
    const healthy = scoreApiKey(key("healthy"), nowMs);
    const penalized = scoreApiKey(
      key("penalized", {
        rateLimit15m: 3,
        ewmaLatencyMs: 240_000,
      }),
      nowMs,
    );

    expect(penalized).toBeLessThan(healthy);
  });
});

describe("pickApiKey", () => {
  it("does not inspect keys when supplier circuit is open", () => {
    const opened = recordProviderFailure(provider(), classifyProviderError({ status: 524 }), nowMs);

    expect(() => pickApiKey([key("a"), key("b")], opened, { nowMs, random: () => 0 })).toThrow(
      "Provider circuit is open",
    );
  });

  it("filters disabled, cooling, and full keys before selection", () => {
    const selected = pickApiKey(
      [
        key("disabled", { enabled: false }),
        key("cooldown", { state: "cooldown", cooldownUntilMs: nowMs + 60_000 }),
        key("full", { inFlight: 1, maxInFlight: 1 }),
        key("available", { success15m: 10 }),
      ],
      provider(),
      { nowMs, random: () => 0 },
    );

    expect(selected.id).toBe("available");
  });

  it("throws when no key is available", () => {
    expect(() =>
      pickApiKey([key("full", { inFlight: 1, maxInFlight: 1 })], provider(), {
        nowMs,
        random: () => 0,
      }),
    ).toThrow(NoAvailableApiKeyError);
  });
});

describe("recordApiKeyResult", () => {
  it("disables a key on 401 or 403 without opening provider circuit", () => {
    const result = recordApiKeyResult(
      key("bad-auth", { inFlight: 1 }),
      provider(),
      { kind: "failure", classification: classifyProviderError({ status: 401 }) },
      nowMs,
    );

    expect(result.key.state).toBe("disabled");
    expect(result.key.enabled).toBe(false);
    expect(result.key.inFlight).toBe(0);
    expect(result.provider.state).toBe("closed");
  });

  it("cools one key on 429 without opening provider circuit", () => {
    const result = recordApiKeyResult(
      key("rate-limited", { inFlight: 1 }),
      provider(),
      { kind: "failure", classification: classifyProviderError({ status: 429 }) },
      nowMs,
    );

    expect(result.key.state).toBe("cooldown");
    expect(result.key.cooldownUntilMs).toBe(nowMs + 2 * 60 * 1000);
    expect(result.provider.state).toBe("closed");
  });

  it("opens supplier circuit when one key receives a cost-risk provider failure", () => {
    const result = recordApiKeyResult(
      key("cost-risk", { inFlight: 1 }),
      provider(),
      { kind: "failure", classification: classifyProviderError({ status: 524 }) },
      nowMs,
    );

    expect(result.key.state).toBe("cooldown");
    expect(result.key.consecutiveCostRiskFailures).toBe(1);
    expect(result.provider.state).toBe("open");
    expect(result.provider.openUntilMs).toBe(nowMs + 5 * 60 * 1000);
  });

  it("records success and clears consecutive failure counters", () => {
    const result = recordApiKeyResult(
      key("ok", {
        inFlight: 1,
        consecutiveFailures: 2,
        consecutiveCostRiskFailures: 1,
      }),
      provider(),
      { kind: "success", latencyMs: 90_000 },
      nowMs,
    );

    expect(result.key.inFlight).toBe(0);
    expect(result.key.success15m).toBe(6);
    expect(result.key.consecutiveFailures).toBe(0);
    expect(result.key.consecutiveCostRiskFailures).toBe(0);
    expect(result.provider.state).toBe("closed");
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
npm run test:run -- src/core/apiKeyRouter.test.ts
```

Expected: FAIL because `src/core/apiKeyRouter.ts` does not exist.

- [ ] **Step 3: Implement the router**

Create `src/core/apiKeyRouter.ts`:

```ts
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
  constructor(message = "No available hosted API key.") {
    super(message);
    this.name = "NoAvailableApiKeyError";
  }
}

const RATE_LIMIT_COOLDOWN_MS = 2 * 60 * 1000;
const KEY_COST_RISK_COOLDOWN_MS = 5 * 60 * 1000;
const UNKNOWN_FAILURE_COOLDOWN_MS = 60 * 1000;

export function pickApiKey(
  keys: ApiKeyRuntimeState[],
  provider: ProviderCircuit,
  options: PickApiKeyOptions,
): ApiKeyRuntimeState {
  const availability = canUseProvider(provider, options.nowMs, "user");
  if (!availability.allowed) {
    throw new ProviderCircuitOpenError(availability.reason ?? "Provider circuit is open.");
  }

  const scored = keys
    .map((candidate) => ({
      key: candidate,
      score: scoreApiKey(candidate, options.nowMs),
    }))
    .filter((candidate) => candidate.score > 0);

  if (scored.length === 0) {
    throw new NoAvailableApiKeyError();
  }

  return weightedRandom(scored, options.random ?? Math.random);
}

export function scoreApiKey(key: ApiKeyRuntimeState, nowMs: number): number {
  if (!isApiKeyAvailable(key, nowMs)) {
    return 0;
  }

  const successRate = (key.success15m + 1) / (key.success15m + key.fail15m + 2);
  const capacity = Math.max(0.05, 1 - key.inFlight / Math.max(1, key.maxInFlight));
  const rateLimitPenalty = 1 / (1 + key.rateLimit15m);
  const costRiskPenalty = 1 / (1 + key.costRiskFail15m * 3);
  const latencyPenalty =
    key.ewmaLatencyMs === null ? 1 : Math.max(0.25, 120_000 / Math.max(120_000, key.ewmaLatencyMs));
  const freshnessBoost =
    key.lastUsedAtMs === null ? 1.15 : Math.min(1.25, 1 + Math.max(0, nowMs - key.lastUsedAtMs) / (60 * 60 * 1000));

  return Math.max(0.01, 100 * successRate * capacity * rateLimitPenalty * costRiskPenalty * latencyPenalty * freshnessBoost);
}

export function isApiKeyAvailable(key: ApiKeyRuntimeState, nowMs: number): boolean {
  return (
    key.enabled &&
    key.state !== "disabled" &&
    (key.cooldownUntilMs === null || key.cooldownUntilMs <= nowMs) &&
    key.inFlight < key.maxInFlight
  );
}

export function recordApiKeyResult(
  key: ApiKeyRuntimeState,
  provider: ProviderCircuit,
  result: ApiKeyResult,
  nowMs: number,
): ApiKeyResultUpdate {
  if (result.kind === "success") {
    return {
      key: {
        ...key,
        state: "healthy",
        cooldownUntilMs: null,
        inFlight: Math.max(0, key.inFlight - 1),
        success15m: key.success15m + 1,
        success1h: key.success1h + 1,
        consecutiveFailures: 0,
        consecutiveCostRiskFailures: 0,
        ewmaLatencyMs: blendLatency(key.ewmaLatencyMs, result.latencyMs),
        lastUsedAtMs: nowMs,
      },
      provider: recordProviderSuccess(provider, nowMs),
    };
  }

  const classification = result.classification;
  const baseFailureKey: ApiKeyRuntimeState = {
    ...key,
    inFlight: Math.max(0, key.inFlight - 1),
    fail15m: key.fail15m + 1,
    fail1h: key.fail1h + 1,
    consecutiveFailures: key.consecutiveFailures + 1,
    lastUsedAtMs: nowMs,
  };

  if (classification.shouldDisableApiKey) {
    return {
      key: {
        ...baseFailureKey,
        enabled: false,
        state: "disabled",
        cooldownUntilMs: null,
      },
      provider,
    };
  }

  if (classification.category === "rate_limit") {
    return {
      key: {
        ...baseFailureKey,
        state: "cooldown",
        cooldownUntilMs: nowMs + RATE_LIMIT_COOLDOWN_MS,
        rateLimit15m: key.rateLimit15m + 1,
      },
      provider,
    };
  }

  if (classification.category === "cost_risk") {
    return {
      key: {
        ...baseFailureKey,
        state: "cooldown",
        cooldownUntilMs: nowMs + KEY_COST_RISK_COOLDOWN_MS,
        costRiskFail15m: key.costRiskFail15m + 1,
        consecutiveCostRiskFailures: key.consecutiveCostRiskFailures + 1,
      },
      provider: recordProviderFailure(provider, classification, nowMs),
    };
  }

  if (baseFailureKey.consecutiveFailures >= 3) {
    return {
      key: {
        ...baseFailureKey,
        state: "cooldown",
        cooldownUntilMs: nowMs + UNKNOWN_FAILURE_COOLDOWN_MS,
      },
      provider,
    };
  }

  return {
    key: baseFailureKey,
    provider,
  };
}

function weightedRandom(
  scored: Array<{ key: ApiKeyRuntimeState; score: number }>,
  random: () => number,
): ApiKeyRuntimeState {
  const total = scored.reduce((sum, item) => sum + item.score, 0);
  let threshold = random() * total;

  for (const item of scored) {
    threshold -= item.score;
    if (threshold <= 0) {
      return item.key;
    }
  }

  return scored[scored.length - 1].key;
}

function blendLatency(previous: number | null, next: number): number {
  if (previous === null) {
    return next;
  }

  return Math.round(previous * 0.7 + next * 0.3);
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```powershell
npm run test:run -- src/core/apiKeyRouter.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the key router**

```powershell
git add src/core/apiKeyRouter.ts src/core/apiKeyRouter.test.ts
git commit -m "feat: route hosted api keys safely"
```

## Task 4: Health Probe Guard

**Files:**
- Create: `src/core/healthProbe.ts`
- Test: `src/core/healthProbe.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/core/healthProbe.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { type ApiKeyRuntimeState } from "./apiKeyRouter";
import { classifyProviderError } from "./providerErrors";
import { ProviderCircuitOpenError, createProviderCircuit, recordProviderFailure } from "./providerCircuit";
import { createHealthProbeAttempt, shouldRunScheduledHealthProbe } from "./healthProbe";

const nowMs = Date.UTC(2026, 4, 2, 12, 0, 0);

function key(id: string, overrides: Partial<ApiKeyRuntimeState> = {}): ApiKeyRuntimeState {
  return {
    id,
    label: id,
    enabled: true,
    state: "healthy",
    cooldownUntilMs: null,
    inFlight: 0,
    maxInFlight: 1,
    success15m: 0,
    fail15m: 0,
    costRiskFail15m: 0,
    rateLimit15m: 0,
    success1h: 0,
    fail1h: 0,
    consecutiveFailures: 0,
    consecutiveCostRiskFailures: 0,
    ewmaLatencyMs: null,
    lastUsedAtMs: null,
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

describe("health probe guard", () => {
  it("skips scheduled probes while the supplier circuit is still open", () => {
    const opened = recordProviderFailure(provider(), classifyProviderError({ status: 524 }), nowMs);

    expect(shouldRunScheduledHealthProbe(opened, nowMs + 60_000)).toBe(false);
  });

  it("starts exactly one half-open probe after cooldown expires", () => {
    const opened = recordProviderFailure(provider(), classifyProviderError({ status: 524 }), nowMs);
    const afterCooldown = nowMs + 5 * 60 * 1000 + 1;

    const attempt = createHealthProbeAttempt(
      [key("one"), key("two"), key("three")],
      opened,
      afterCooldown,
    );

    expect(attempt.key.id).toBe("one");
    expect(attempt.provider.state).toBe("half_open");
    expect(attempt.provider.halfOpenProbeInFlight).toBe(true);
    expect(() => createHealthProbeAttempt([key("two")], attempt.provider, afterCooldown)).toThrow(
      ProviderCircuitOpenError,
    );
  });

  it("selects the least-used available probe key instead of probing all keys", () => {
    const attempt = createHealthProbeAttempt(
      [
        key("busy", { success1h: 20, fail1h: 3 }),
        key("least-used", { success1h: 1, fail1h: 0 }),
        key("cooldown", { state: "cooldown", cooldownUntilMs: nowMs + 60_000 }),
      ],
      provider(),
      nowMs,
    );

    expect(attempt.key.id).toBe("least-used");
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
npm run test:run -- src/core/healthProbe.test.ts
```

Expected: FAIL because `src/core/healthProbe.ts` does not exist.

- [ ] **Step 3: Implement one-key health probing**

Create `src/core/healthProbe.ts`:

```ts
import { isApiKeyAvailable, type ApiKeyRuntimeState } from "./apiKeyRouter";
import {
  ProviderCircuitOpenError,
  canUseProvider,
  reserveProviderProbe,
  type ProviderCircuit,
} from "./providerCircuit";

export type HealthProbeAttempt = {
  key: ApiKeyRuntimeState;
  provider: ProviderCircuit;
};

export function shouldRunScheduledHealthProbe(provider: ProviderCircuit, nowMs: number): boolean {
  const availability = canUseProvider(provider, nowMs, "health_probe");
  return availability.allowed;
}

export function createHealthProbeAttempt(
  keys: ApiKeyRuntimeState[],
  provider: ProviderCircuit,
  nowMs: number,
): HealthProbeAttempt {
  const availability = canUseProvider(provider, nowMs, "health_probe");
  if (!availability.allowed) {
    throw new ProviderCircuitOpenError(availability.reason ?? "Provider health probe is not allowed.");
  }

  const key = pickProbeKey(keys, nowMs);
  const reservedProvider = reserveProviderProbe(provider, nowMs, "health_probe");

  return {
    key,
    provider: reservedProvider,
  };
}

function pickProbeKey(keys: ApiKeyRuntimeState[], nowMs: number): ApiKeyRuntimeState {
  const candidates = keys
    .filter((key) => isApiKeyAvailable(key, nowMs))
    .sort((left, right) => {
      const leftUsage = left.success1h + left.fail1h + left.inFlight;
      const rightUsage = right.success1h + right.fail1h + right.inFlight;
      if (leftUsage !== rightUsage) {
        return leftUsage - rightUsage;
      }

      const leftLastUsed = left.lastUsedAtMs ?? 0;
      const rightLastUsed = right.lastUsedAtMs ?? 0;
      return leftLastUsed - rightLastUsed;
    });

  if (candidates.length === 0) {
    throw new ProviderCircuitOpenError("No available API key for provider health probe.");
  }

  return candidates[0];
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```powershell
npm run test:run -- src/core/healthProbe.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the health probe guard**

```powershell
git add src/core/healthProbe.ts src/core/healthProbe.test.ts
git commit -m "feat: guard provider health probes"
```

## Task 5: Generation Billing Policy

**Files:**
- Create: `src/core/generationPolicy.ts`
- Test: `src/core/generationPolicy.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/core/generationPolicy.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { getGenerationCreditDecision } from "./generationPolicy";

describe("getGenerationCreditDecision", () => {
  it("debits one credit only for successful platform-hosted generation", () => {
    expect(getGenerationCreditDecision({ kind: "success" })).toEqual({
      debitCredits: 1,
      ledgerEvent: "generation_debit",
      costRisk: false,
      userMessage: "Generation succeeded and 1 credit was used.",
    });
  });

  it("does not charge users for provider cost-risk failures", () => {
    expect(getGenerationCreditDecision({ kind: "provider_cost_risk_failure" })).toEqual({
      debitCredits: 0,
      ledgerEvent: "provider_failure_no_charge",
      costRisk: true,
      userMessage: "The provider may have charged the platform, but no user credit was used.",
    });
  });

  it("does not charge when the provider circuit is already open", () => {
    expect(getGenerationCreditDecision({ kind: "provider_circuit_open" })).toMatchObject({
      debitCredits: 0,
      ledgerEvent: "provider_circuit_open_no_charge",
      costRisk: false,
    });
  });

  it("does not charge validation, auth, rate-limit, timeout, or cancelled outcomes", () => {
    expect(getGenerationCreditDecision({ kind: "validation_error" }).debitCredits).toBe(0);
    expect(getGenerationCreditDecision({ kind: "auth_error" }).debitCredits).toBe(0);
    expect(getGenerationCreditDecision({ kind: "rate_limited" }).debitCredits).toBe(0);
    expect(getGenerationCreditDecision({ kind: "timeout" }).debitCredits).toBe(0);
    expect(getGenerationCreditDecision({ kind: "cancelled" }).debitCredits).toBe(0);
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
npm run test:run -- src/core/generationPolicy.test.ts
```

Expected: FAIL because `src/core/generationPolicy.ts` does not exist.

- [ ] **Step 3: Implement billing decisions**

Create `src/core/generationPolicy.ts`:

```ts
export type GenerationOutcomeKind =
  | "success"
  | "validation_error"
  | "provider_cost_risk_failure"
  | "provider_circuit_open"
  | "auth_error"
  | "rate_limited"
  | "timeout"
  | "cancelled"
  | "unknown_failure";

export type GenerationOutcome = {
  kind: GenerationOutcomeKind;
};

export type CreditLedgerEvent =
  | "generation_debit"
  | "input_rejected_no_charge"
  | "provider_failure_no_charge"
  | "provider_circuit_open_no_charge"
  | "auth_failure_no_charge"
  | "rate_limit_no_charge"
  | "timeout_no_charge"
  | "cancelled_no_charge"
  | "unknown_failure_no_charge";

export type GenerationCreditDecision = {
  debitCredits: number;
  ledgerEvent: CreditLedgerEvent;
  costRisk: boolean;
  userMessage: string;
};

export function getGenerationCreditDecision(outcome: GenerationOutcome): GenerationCreditDecision {
  switch (outcome.kind) {
    case "success":
      return {
        debitCredits: 1,
        ledgerEvent: "generation_debit",
        costRisk: false,
        userMessage: "Generation succeeded and 1 credit was used.",
      };
    case "validation_error":
      return {
        debitCredits: 0,
        ledgerEvent: "input_rejected_no_charge",
        costRisk: false,
        userMessage: "The request was rejected before calling the provider. No credit was used.",
      };
    case "provider_cost_risk_failure":
      return {
        debitCredits: 0,
        ledgerEvent: "provider_failure_no_charge",
        costRisk: true,
        userMessage: "The provider may have charged the platform, but no user credit was used.",
      };
    case "provider_circuit_open":
      return {
        debitCredits: 0,
        ledgerEvent: "provider_circuit_open_no_charge",
        costRisk: false,
        userMessage: "The hosted image service is temporarily paused. No credit was used.",
      };
    case "auth_error":
      return {
        debitCredits: 0,
        ledgerEvent: "auth_failure_no_charge",
        costRisk: false,
        userMessage: "The platform key is not usable. No credit was used.",
      };
    case "rate_limited":
      return {
        debitCredits: 0,
        ledgerEvent: "rate_limit_no_charge",
        costRisk: false,
        userMessage: "The provider rate-limited this request. No credit was used.",
      };
    case "timeout":
      return {
        debitCredits: 0,
        ledgerEvent: "timeout_no_charge",
        costRisk: false,
        userMessage: "The request timed out. No credit was used.",
      };
    case "cancelled":
      return {
        debitCredits: 0,
        ledgerEvent: "cancelled_no_charge",
        costRisk: false,
        userMessage: "The request was cancelled. No credit was used.",
      };
    case "unknown_failure":
      return {
        debitCredits: 0,
        ledgerEvent: "unknown_failure_no_charge",
        costRisk: false,
        userMessage: "Generation failed. No credit was used.",
      };
  }
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```powershell
npm run test:run -- src/core/generationPolicy.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the billing policy**

```powershell
git add src/core/generationPolicy.ts src/core/generationPolicy.test.ts
git commit -m "feat: add generation credit policy"
```

## Task 6: Platform Core Export and Critical Integration Regression

**Files:**
- Create: `src/core/platformCore.ts`
- Test: `src/core/platformCore.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `src/core/platformCore.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  classifyProviderError,
  createHealthProbeAttempt,
  createProviderCircuit,
  pickApiKey,
  recordApiKeyResult,
  shouldRunScheduledHealthProbe,
  type ApiKeyRuntimeState,
} from "./platformCore";

const nowMs = Date.UTC(2026, 4, 2, 12, 0, 0);

function key(id: string): ApiKeyRuntimeState {
  return {
    id,
    label: id,
    enabled: true,
    state: "healthy",
    cooldownUntilMs: null,
    inFlight: 0,
    maxInFlight: 1,
    success15m: 5,
    fail15m: 0,
    costRiskFail15m: 0,
    rateLimit15m: 0,
    success1h: 20,
    fail1h: 0,
    consecutiveFailures: 0,
    consecutiveCostRiskFailures: 0,
    ewmaLatencyMs: 120_000,
    lastUsedAtMs: null,
  };
}

describe("platform core integration", () => {
  it("opens the supplier circuit after one costly failure and does not route to the other nine keys", () => {
    const keys = Array.from({ length: 10 }, (_, index) => key(`key-${index + 1}`));
    const provider = createProviderCircuit({
      providerId: "ruoli",
      baseUrl: "https://ruoli.dev/v1",
      imageModel: "gpt-image-2",
      nowMs,
    });

    const selected = pickApiKey(keys, provider, { nowMs, random: () => 0 });
    const failed = recordApiKeyResult(
      { ...selected, inFlight: 1 },
      provider,
      { kind: "failure", classification: classifyProviderError({ status: 524 }) },
      nowMs,
    );

    expect(failed.provider.state).toBe("open");
    expect(() => pickApiKey(keys.slice(1), failed.provider, { nowMs: nowMs + 1, random: () => 0 })).toThrow(
      "Provider circuit is open",
    );
    expect(shouldRunScheduledHealthProbe(failed.provider, nowMs + 60_000)).toBe(false);
  });

  it("allows exactly one recovery probe after the circuit window", () => {
    const keys = Array.from({ length: 10 }, (_, index) => key(`key-${index + 1}`));
    const provider = createProviderCircuit({
      providerId: "ruoli",
      baseUrl: "https://ruoli.dev/v1",
      imageModel: "gpt-image-2",
      nowMs,
    });
    const failed = recordApiKeyResult(
      { ...keys[0], inFlight: 1 },
      provider,
      { kind: "failure", classification: classifyProviderError({ message: "bad_response_status_code" }) },
      nowMs,
    );

    const attempt = createHealthProbeAttempt(keys, failed.provider, nowMs + 5 * 60 * 1000 + 1);

    expect(attempt.key.id).toBe("key-1");
    expect(attempt.provider.state).toBe("half_open");
    expect(attempt.provider.halfOpenProbeInFlight).toBe(true);
    expect(() => createHealthProbeAttempt(keys, attempt.provider, nowMs + 5 * 60 * 1000 + 2)).toThrow(
      "A provider recovery probe is already running.",
    );
  });
});
```

- [ ] **Step 2: Run the integration test and verify it fails**

Run:

```powershell
npm run test:run -- src/core/platformCore.test.ts
```

Expected: FAIL because `src/core/platformCore.ts` does not exist.

- [ ] **Step 3: Add the platform core barrel export**

Create `src/core/platformCore.ts`:

```ts
export * from "./providerErrors";
export * from "./providerCircuit";
export * from "./apiKeyRouter";
export * from "./healthProbe";
export * from "./generationPolicy";
```

- [ ] **Step 4: Run the integration test and verify it passes**

Run:

```powershell
npm run test:run -- src/core/platformCore.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run all new platform-core tests**

Run:

```powershell
npm run test:run -- src/core/providerErrors.test.ts src/core/providerCircuit.test.ts src/core/apiKeyRouter.test.ts src/core/healthProbe.test.ts src/core/generationPolicy.test.ts src/core/platformCore.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the integration export**

```powershell
git add src/core/platformCore.ts src/core/platformCore.test.ts
git commit -m "feat: export platform protection core"
```

## Task 7: Full Verification

**Files:**
- Modify only if a test reveals a TypeScript or import issue in files created by Tasks 1-6.

- [ ] **Step 1: Run the full test suite**

Run:

```powershell
npm run test:run
```

Expected: all Vitest tests pass.

- [ ] **Step 2: Run the production build**

Run:

```powershell
npm run build
```

Expected: TypeScript compilation and Vite production build pass.

- [ ] **Step 3: Inspect git status before final response**

Run:

```powershell
git status --short
```

Expected: only the intended Phase 1 files are staged or committed by these tasks. Existing unrelated dirty files from the desktop app should not be reverted.

## Self-Review Checklist

- Spec coverage: This plan covers provider error classification, supplier circuit breaking, dynamic API key routing, one-key health probing, and no-charge billing decisions for cost-risk failures.
- Cost protection: A single HTTP 524, `openai_error`, `bad_response_status_code`, structured provider error, or no-image-data response opens the supplier/model circuit immediately.
- No 10x probing: Scheduled health probes do not run while the circuit is still open, and half-open recovery allows only one probe key.
- User charging: Provider cost-risk failures and circuit-open rejections do not debit user credits.
- Deferred scope: accounts, email auth, PostgreSQL, Redis, payment, admin UI, prompt template pages, and Web deployment are separate implementation plans because each is an independent subsystem.
- Verification commands: focused Vitest commands, full `npm run test:run`, and `npm run build`.
