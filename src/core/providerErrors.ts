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
type SafeErrorSummaryOptions = {
  maxLength?: number;
};

const COST_RISK_MARKERS = [
  "openai_error",
  "bad_response_status_code",
  "new_api_error",
  "do_request_failed",
  "upstream error",
  "did not contain any image data",
  "no image data",
  "empty image response",
  "request was accepted",
  "accepted upstream",
  "already be billed",
  "already billed",
] as const;
const DEFAULT_SAFE_ERROR_SUMMARY = "Provider error details were redacted.";
const DEFAULT_SAFE_ERROR_SUMMARY_LENGTH = 280;
const SENSITIVE_FIELD_NAME =
  "(?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key|aws[_-]?secret[_-]?access[_-]?key|aws[_-]?access[_-]?key[_-]?id|github[_-]?token|token|signature|secret|key)";
const SENSITIVE_ASSIGNMENT_PATTERN =
  new RegExp(`(["']?${SENSITIVE_FIELD_NAME}["']?\\s*[:=]\\s*)(["'])(.*?)\\2`, "gi");
const SENSITIVE_BARE_ASSIGNMENT_PATTERN = new RegExp(
  `(\\b${SENSITIVE_FIELD_NAME}\\b\\s*[:=]\\s*)([^\\s,}\\]]+)`,
  "gi",
);
const CREDENTIAL_TOKEN_SOURCE = [
  "sk[-_A-Za-z0-9]{10,}",
  "1ts[-_A-Za-z0-9]{10,}",
  "gh[pousr]_[A-Za-z0-9]{20,}",
  "github_pat_[A-Za-z0-9_]{20,}",
  "(?:AKIA|ASIA)[A-Z0-9]{16}",
  "AIza[A-Za-z0-9_-]{28,}",
  "xox[baprs]-[A-Za-z0-9-]{20,}",
  "ya29\\.[A-Za-z0-9_-]{20,}",
].join("|");
const CREDENTIAL_TOKEN_PATTERN = new RegExp(CREDENTIAL_TOKEN_SOURCE, "gi");
const CREDENTIAL_TOKEN_DETECTION_PATTERN = new RegExp(CREDENTIAL_TOKEN_SOURCE, "i");

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

  const costRisk = isCostRiskProviderError(input);

  if (input.status === 429) {
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

  return hasStructuredErrorObject(input.payload) && input.status === 200;
}

export function isCredentialLikeToken(value: string): boolean {
  return CREDENTIAL_TOKEN_DETECTION_PATTERN.test(value);
}

export function summarizeSensitiveError(input: unknown, options: SafeErrorSummaryOptions = {}): string {
  const normalized = normalizeProviderErrorInput(input);
  const classification = classifyProviderError(normalized);
  const parts: string[] = [];

  if (typeof normalized.status === "number") {
    parts.push(`HTTP ${normalized.status}`);
  }

  if (classification.category !== "unknown") {
    parts.push(classification.category.replace(/_/g, " "));
  } else if (normalized.kind) {
    parts.push(normalized.kind);
  }

  const messages = uniqueStrings([
    sanitizePublicErrorText(normalized.message),
    sanitizePublicErrorText(normalized.code),
    sanitizePublicErrorText(normalized.type),
    sanitizePublicErrorText(normalized.nestedMessage),
    sanitizePublicErrorText(normalized.nestedCode),
    sanitizePublicErrorText(normalized.nestedType),
  ]);

  if (messages.length > 0) {
    parts.push(messages.join(" | "));
  }

  if (normalized.hasHiddenDetails) {
    parts.push("details redacted");
  }

  const summary = limitSummary(uniqueStrings(parts).join(" · "), options.maxLength ?? DEFAULT_SAFE_ERROR_SUMMARY_LENGTH);
  return summary || DEFAULT_SAFE_ERROR_SUMMARY;
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

type NormalizedProviderErrorInput = ProviderErrorInput & {
  nestedMessage?: string;
  nestedCode?: string;
  nestedType?: string;
  hasHiddenDetails: boolean;
};

function normalizeProviderErrorInput(input: unknown): NormalizedProviderErrorInput {
  if (typeof input === "string") {
    return normalizeStringProviderError(input);
  }

  if (input instanceof Error) {
    return normalizeObjectProviderError({
      ...asRecord(input),
      message: input.message,
    });
  }

  if (input && typeof input === "object") {
    return normalizeObjectProviderError(input as JsonRecord);
  }

  return {
    message: DEFAULT_SAFE_ERROR_SUMMARY,
    hasHiddenDetails: false,
  };
}

function normalizeStringProviderError(message: string): NormalizedProviderErrorInput {
  const embeddedJson = parseEmbeddedJson(message);
  const embeddedRecord = asRecord(embeddedJson);
  const embeddedError = findNestedErrorRecord(embeddedRecord);

  return {
    status: extractStatusFromText(message),
    message,
    code: asString(embeddedRecord.code),
    type: asString(embeddedRecord.type),
    nestedMessage: asString(embeddedError.message),
    nestedCode: asString(embeddedError.code),
    nestedType: asString(embeddedError.type),
    hasHiddenDetails: Boolean(embeddedJson),
  };
}

function normalizeObjectProviderError(record: JsonRecord): NormalizedProviderErrorInput {
  const messageText = asString(record.message);
  const messageRecord = asRecord(parseEmbeddedJson(messageText ?? ""));
  const messageError = findNestedErrorRecord(messageRecord);
  const responseBodyText = asString(record.responseBody);
  const responseBodyRecord = asRecord(parseEmbeddedJson(responseBodyText ?? ""));
  const responseBodyError = findNestedErrorRecord(responseBodyRecord);
  const payload = record.payload;
  const payloadRecord = asRecord(payload);
  const payloadError = findNestedErrorRecord(payloadRecord);
  const directError = findNestedErrorRecord(record);

  return {
    status: asNumber(record.status) ?? extractStatusFromText(asString(record.message)),
    kind: asProviderTransportKind(record.kind),
    message: messageText,
    code: asString(record.code),
    type: asString(record.type),
    responseBody: responseBodyText,
    payload,
    nestedMessage:
      asString(directError.message) ??
      asString(messageError.message) ??
      asString(payloadError.message) ??
      asString(responseBodyError.message),
    nestedCode:
      asString(directError.code) ??
      asString(messageError.code) ??
      asString(payloadError.code) ??
      asString(responseBodyError.code),
    nestedType:
      asString(directError.type) ??
      asString(messageError.type) ??
      asString(payloadError.type) ??
      asString(responseBodyError.type),
    hasHiddenDetails:
      Boolean(messageRecord.error) ||
      Boolean(responseBodyText) ||
      payload !== undefined ||
      responseBodyRecord.error !== undefined ||
      payloadRecord.error !== undefined,
  };
}

function sanitizePublicErrorText(value: string | undefined): string {
  if (!value) {
    return "";
  }

  return collapseWhitespace(
    redactSensitiveText(stripEmbeddedJsonBodies(value))
      .replace(/\bresponseBody\b/gi, "details")
      .replace(/\bpayload\b/gi, "details"),
  );
}

function stripEmbeddedJsonBodies(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    const record = asRecord(parseEmbeddedJson(trimmed));
    const message = asString(findNestedErrorRecord(record).message) ?? asString(record.message);
    return message ? `${message} (details redacted)` : "details redacted";
  }

  return parseEmbeddedJson(value) ? value.replace(/\{[\s\S]*\}/, "details redacted") : value;
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/\b(Authorization\s*:\s*Bearer)\s+[A-Za-z0-9._~+/=-]{6,}/gi, "$1 [redacted]")
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]{10,}/gi, "$1 [redacted]")
    .replace(SENSITIVE_ASSIGNMENT_PATTERN, (_match, prefix: string, quote: string) => `${prefix}${quote}[redacted]${quote}`)
    .replace(SENSITIVE_BARE_ASSIGNMENT_PATTERN, "$1[redacted]")
    .replace(/([?&](?:signature|token|key|api_key|access_token)=)[^&\s"'<>]+/gi, "$1[redacted]")
    .replace(CREDENTIAL_TOKEN_PATTERN, "[redacted-token]")
    .replace(/https?:\/\/[^\s"'<>]+/g, "[redacted-url]");
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function limitSummary(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 14)).trimEnd()}… [truncated]`;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (!value) {
      continue;
    }

    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    result.push(value);
  }

  return result;
}

function parseEmbeddedJson(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }

  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(value.slice(start, end + 1));
    } catch {
      return null;
    }
  }

  return null;
}

function extractStatusFromText(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.match(/\bHTTP\s+(\d{3})\b/i) ?? value.match(/\bstatus(?:\s+code)?\s*[:=]?\s*(\d{3})\b/i);
  if (!match) {
    return undefined;
  }

  const status = Number(match[1]);
  return Number.isFinite(status) ? status : undefined;
}

function findNestedErrorRecord(record: JsonRecord): JsonRecord {
  const directError = asRecord(record.error);
  if (Object.keys(directError).length > 0) {
    return directError;
  }

  const nestedPayloadError = asRecord(asRecord(record.payload).error);
  if (Object.keys(nestedPayloadError).length > 0) {
    return nestedPayloadError;
  }

  return {};
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function asProviderTransportKind(value: unknown): ProviderTransportKind | undefined {
  return value === "timeout" || value === "network" || value === "http" || value === "parse" ? value : undefined;
}
