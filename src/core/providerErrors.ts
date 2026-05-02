export type ProviderErrorCategory = "auth" | "rate_limit" | "timeout" | "network" | "validation" | "cost_risk" | "unknown";

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

type JsonRecord = Record<string, unknown>;

const COST_RISK_MARKERS = [
  "openai_error",
  "bad_response_status_code",
  "did not contain any image data",
  "no image data",
  "empty image response",
] as const;

export function classifyProviderError(input: ProviderErrorInput): ProviderErrorClassification {
  if (input.status === 401 || input.status === 403) {
    return {
      category: "auth",
      reason: `Provider rejected authentication with HTTP ${input.status}.`,
      shouldOpenProviderCircuit: false,
      shouldCooldownApiKey: false,
      shouldDisableApiKey: true,
      userChargeable: false,
    };
  }

  if (input.status === 429) {
    return {
      category: "rate_limit",
      reason: "Provider rate-limited the API key.",
      shouldOpenProviderCircuit: false,
      shouldCooldownApiKey: true,
      shouldDisableApiKey: false,
      userChargeable: false,
    };
  }

  if (input.kind === "timeout" || input.status === 408) {
    return {
      category: "timeout",
      reason: "Provider request timed out before a usable response arrived.",
      shouldOpenProviderCircuit: false,
      shouldCooldownApiKey: false,
      shouldDisableApiKey: false,
      userChargeable: false,
    };
  }

  if (input.kind === "network") {
    return {
      category: "network",
      reason: "Network failure prevented the provider request from completing.",
      shouldOpenProviderCircuit: false,
      shouldCooldownApiKey: false,
      shouldDisableApiKey: false,
      userChargeable: false,
    };
  }

  const costRisk = isCostRiskProviderError(input);

  if (input.status === 400 && !costRisk) {
    return {
      category: "validation",
      reason: "Provider rejected the request as invalid.",
      shouldOpenProviderCircuit: false,
      shouldCooldownApiKey: false,
      shouldDisableApiKey: false,
      userChargeable: false,
    };
  }

  if (costRisk) {
    return {
      category: "cost_risk",
      reason: "Provider failure may have consumed image-generation cost.",
      shouldOpenProviderCircuit: true,
      shouldCooldownApiKey: true,
      shouldDisableApiKey: false,
      userChargeable: false,
    };
  }

  return {
    category: "unknown",
    reason: "Provider failure did not match a known classification rule.",
    shouldOpenProviderCircuit: false,
    shouldCooldownApiKey: false,
    shouldDisableApiKey: false,
    userChargeable: false,
  };
}

export function isCostRiskProviderError(input: ProviderErrorInput): boolean {
  if (input.status === 524) {
    return true;
  }

  const haystack = collectSearchText(input);
  if (COST_RISK_MARKERS.some((marker) => haystack.includes(marker))) {
    return true;
  }

  return hasStructuredErrorObject(input.payload) && input.status !== 400;
}

function collectSearchText(input: ProviderErrorInput): string {
  return [
    input.message,
    input.code,
    input.type,
    input.responseBody,
    stringifyJson(input.payload),
  ]
    .filter((value): value is string => typeof value === "string")
    .join("\n")
    .toLowerCase();
}

function hasStructuredErrorObject(value: unknown): boolean {
  const record = asRecord(value);
  const error = asRecord(record.error);
  return Object.keys(error).length > 0;
}

function stringifyJson(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value === null || value === undefined) {
    return "";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" ? (value as JsonRecord) : {};
}
