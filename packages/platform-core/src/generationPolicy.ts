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

const DECISIONS = {
  success: {
    debitCredits: 1,
    ledgerEvent: "generation_debit",
    costRisk: false,
    userMessage: "Generation succeeded and 1 credit was used.",
  },
  validation_error: {
    debitCredits: 0,
    ledgerEvent: "input_rejected_no_charge",
    costRisk: false,
    userMessage: "The request was rejected before generation, and no user credit was used.",
  },
  provider_cost_risk_failure: {
    debitCredits: 0,
    ledgerEvent: "provider_failure_no_charge",
    costRisk: true,
    userMessage: "The provider may have charged the platform, but no user credit was used.",
  },
  provider_circuit_open: {
    debitCredits: 0,
    ledgerEvent: "provider_circuit_open_no_charge",
    costRisk: false,
    userMessage: "The hosted image service is temporarily paused, and no user credit was used.",
  },
  auth_error: {
    debitCredits: 0,
    ledgerEvent: "auth_failure_no_charge",
    costRisk: false,
    userMessage: "The hosted image service could not authenticate, and no user credit was used.",
  },
  rate_limited: {
    debitCredits: 0,
    ledgerEvent: "rate_limit_no_charge",
    costRisk: false,
    userMessage: "The hosted image service is rate-limited right now, and no user credit was used.",
  },
  timeout: {
    debitCredits: 0,
    ledgerEvent: "timeout_no_charge",
    costRisk: false,
    userMessage: "The hosted image service timed out, and no user credit was used.",
  },
  cancelled: {
    debitCredits: 0,
    ledgerEvent: "cancelled_no_charge",
    costRisk: false,
    userMessage: "Generation was cancelled, and no user credit was used.",
  },
  unknown_failure: {
    debitCredits: 0,
    ledgerEvent: "unknown_failure_no_charge",
    costRisk: false,
    userMessage: "Generation failed for an unknown reason, and no user credit was used.",
  },
} as const satisfies Record<GenerationOutcomeKind, GenerationCreditDecision>;

export function getGenerationCreditDecision(outcome: GenerationOutcome): GenerationCreditDecision {
  return { ...DECISIONS[outcome.kind] };
}
