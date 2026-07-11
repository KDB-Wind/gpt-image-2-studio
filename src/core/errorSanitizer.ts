import {
  classifyProviderError,
  isCredentialLikeToken,
  summarizeSensitiveError,
  type ProviderErrorCategory,
  type ProviderErrorInput,
  type ProviderTransportKind,
} from "./providerErrors";

export type SafeProviderErrorCategory =
  | "auth"
  | "rate-limit"
  | "timeout"
  | "provider"
  | "network"
  | "unknown";

export type SafeProviderError = {
  category: SafeProviderErrorCategory;
  userMessage: string;
  requestId?: string;
};

const MAX_PUBLIC_ERROR_LENGTH = 280;
const MAX_SUMMARY_LENGTH = 230;
const REQUEST_ID_PATTERN =
  /\b(?:request[\s_-]?id|requestid|x-request-id)["']?\s*[:=]?\s*["']?\(?([A-Za-z0-9][A-Za-z0-9._-]{5,79})\b/i;

export function sanitizeProviderError(input: unknown): SafeProviderError {
  const providerInput = toProviderErrorInput(input);
  const classification = classifyProviderError(providerInput);
  const requestId = extractSafeRequestId(input);
  const summary = stripCredentialLabels(
    summarizeSensitiveError(input, { maxLength: MAX_SUMMARY_LENGTH }),
  );
  const requestIdSuffix = requestId && !summary.includes(requestId) ? ` Request ID: ${requestId}` : "";

  return {
    category: mapCategory(classification.category, providerInput),
    userMessage: limitText(`${summary}${requestIdSuffix}`.trim(), MAX_PUBLIC_ERROR_LENGTH),
    ...(requestId ? { requestId } : null),
  };
}

export function safeErrorMessage(input: unknown): string {
  return sanitizeProviderError(input).userMessage;
}

function toProviderErrorInput(input: unknown): ProviderErrorInput {
  if (typeof input === "string") {
    return { message: input };
  }

  if (input instanceof Error) {
    const record = input as Error & Record<string, unknown>;
    return {
      status: asNumber(record.status),
      kind: asTransportKind(record.kind),
      message: input.message,
      code: asString(record.code),
      type: asString(record.type),
      responseBody: asString(record.responseBody),
      payload: record.payload,
    };
  }

  if (input && typeof input === "object") {
    const record = input as Record<string, unknown>;
    return {
      status: asNumber(record.status),
      kind: asTransportKind(record.kind),
      message: asString(record.message),
      code: asString(record.code),
      type: asString(record.type),
      responseBody: asString(record.responseBody),
      payload: record.payload ?? input,
    };
  }

  return { message: "Unexpected error." };
}

function mapCategory(
  category: ProviderErrorCategory,
  input: ProviderErrorInput,
): SafeProviderErrorCategory {
  switch (category) {
    case "auth":
      return "auth";
    case "rate_limit":
      return "rate-limit";
    case "timeout":
      return "timeout";
    case "network":
      return "network";
    case "validation":
    case "cost_risk":
      return "provider";
    default:
      return typeof input.status === "number" && input.status >= 400 ? "provider" : "unknown";
  }
}

function extractSafeRequestId(input: unknown): string | undefined {
  const rawText = collectRawText(input);
  const match = rawText.match(REQUEST_ID_PATTERN);
  const requestId = match?.[1];
  if (!requestId || isCredentialLikeToken(requestId)) {
    return undefined;
  }
  return requestId;
}

function collectRawText(input: unknown): string {
  const parts: string[] = [];

  if (typeof input === "string") {
    parts.push(input);
  } else if (input instanceof Error) {
    parts.push(input.message);
    const record = input as Error & Record<string, unknown>;
    parts.push(asString(record.responseBody) ?? "");
    parts.push(safeStringify(record.payload));
  } else if (input && typeof input === "object") {
    const record = input as Record<string, unknown>;
    parts.push(asString(record.message) ?? "");
    parts.push(asString(record.responseBody) ?? "");
    parts.push(safeStringify(record.payload));
    parts.push(safeStringify(input));
  } else {
    parts.push(safeStringify(input));
  }

  return parts.filter(Boolean).join("\n");
}

function stripCredentialLabels(value: string): string {
  return value
    .replace(/\bAuthorization\s*:\s*Bearer\s*\[redacted\]/gi, "credentials redacted")
    .replace(/\bBearer\s*\[redacted\]/gi, "credentials redacted")
    .replace(/\s+/g, " ")
    .trim();
}

function limitText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 14)).trimEnd()} [truncated]`;
}

function safeStringify(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asTransportKind(value: unknown): ProviderTransportKind | undefined {
  return value === "timeout" || value === "network" || value === "http" || value === "parse"
    ? value
    : undefined;
}
