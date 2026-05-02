import { describe, expect, it } from "vitest";

import {
  getGenerationCreditDecision,
  type CreditLedgerEvent,
  type GenerationOutcomeKind,
} from "./generationPolicy";

describe("getGenerationCreditDecision", () => {
  it("debits one credit for a successful generation", () => {
    expect(getGenerationCreditDecision({ kind: "success" })).toEqual({
      debitCredits: 1,
      ledgerEvent: "generation_debit",
      costRisk: false,
      userMessage: "Generation succeeded and 1 credit was used.",
    });
  });

  it("does not charge the user for provider cost-risk failures", () => {
    expect(getGenerationCreditDecision({ kind: "provider_cost_risk_failure" })).toEqual({
      debitCredits: 0,
      ledgerEvent: "provider_failure_no_charge",
      costRisk: true,
      userMessage: "The provider may have charged the platform, but no user credit was used.",
    });
  });

  it("does not charge the user when the provider circuit is open", () => {
    expect(getGenerationCreditDecision({ kind: "provider_circuit_open" })).toEqual({
      debitCredits: 0,
      ledgerEvent: "provider_circuit_open_no_charge",
      costRisk: false,
      userMessage: "The hosted image service is temporarily paused, and no user credit was used.",
    });
  });

  it("maps all non-chargeable failures to the expected ledger events", () => {
    const cases: Array<{ kind: GenerationOutcomeKind; ledgerEvent: CreditLedgerEvent; costRisk?: boolean }> = [
      { kind: "validation_error", ledgerEvent: "input_rejected_no_charge" },
      { kind: "auth_error", ledgerEvent: "auth_failure_no_charge" },
      { kind: "rate_limited", ledgerEvent: "rate_limit_no_charge" },
      { kind: "timeout", ledgerEvent: "timeout_no_charge" },
      { kind: "cancelled", ledgerEvent: "cancelled_no_charge" },
      { kind: "unknown_failure", ledgerEvent: "unknown_failure_no_charge" },
    ];

    for (const testCase of cases) {
      expect(getGenerationCreditDecision({ kind: testCase.kind })).toMatchObject({
        debitCredits: 0,
        ledgerEvent: testCase.ledgerEvent,
        costRisk: testCase.costRisk ?? false,
      });
    }
  });

  it("returns a decision for every outcome kind", () => {
    const kinds = [
      "success",
      "validation_error",
      "provider_cost_risk_failure",
      "provider_circuit_open",
      "auth_error",
      "rate_limited",
      "timeout",
      "cancelled",
      "unknown_failure",
    ] as const satisfies readonly GenerationOutcomeKind[];

    const decisions = kinds.map((kind) => getGenerationCreditDecision({ kind }));

    expect(decisions).toHaveLength(kinds.length);
    for (const decision of decisions) {
      expect(decision.debitCredits).toBeGreaterThanOrEqual(0);
      expect(typeof decision.userMessage).toBe("string");
    }
  });
});
