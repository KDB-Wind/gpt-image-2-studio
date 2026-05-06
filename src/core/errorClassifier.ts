export type UserErrorKind = "auth" | "provider" | "timeout" | "empty-image" | "network" | "unknown";

export type ClassifiedUserError = {
  kind: UserErrorKind;
  costWarning: boolean;
  technicalDetail: string;
};

type ErrorLike = {
  kind?: unknown;
  status?: unknown;
  responseBody?: unknown;
  message?: unknown;
};

const COST_WARNINGS: Record<UserErrorKind, boolean> = {
  auth: false,
  provider: true,
  timeout: true,
  "empty-image": true,
  network: false,
  unknown: true,
};

export function classifyErrorForUser(error: unknown): ClassifiedUserError {
  const technicalDetail = getTechnicalDetail(error);
  const status = getStatus(error, technicalDetail);
  const errorKind = getErrorKind(error);
  const searchable = `${technicalDetail} ${getResponseBody(error)}`.toLowerCase();
  const kind = detectKind(searchable, status, errorKind);

  return {
    kind,
    costWarning: COST_WARNINGS[kind],
    technicalDetail,
  };
}

function detectKind(searchable: string, status: number | null, errorKind: string): UserErrorKind {
  if (errorKind === "timeout" || searchable.includes("timed out") || searchable.includes("aborterror")) {
    return "timeout";
  }

  if (
    searchable.includes("did not contain any image data") ||
    searchable.includes("no image data") ||
    searchable.includes("no images")
  ) {
    return "empty-image";
  }

  if (
    status === 401 ||
    status === 403 ||
    searchable.includes("invalid api key") ||
    searchable.includes("unauthorized") ||
    searchable.includes("forbidden")
  ) {
    return "auth";
  }

  if (
    status === 524 ||
    (status !== null && status >= 500) ||
    searchable.includes("openai_error") ||
    searchable.includes("bad_response_status_code") ||
    searchable.includes("upstream")
  ) {
    return "provider";
  }

  if (
    errorKind === "network" ||
    searchable.includes("failed to fetch") ||
    searchable.includes("networkerror") ||
    searchable.includes("load failed")
  ) {
    return "network";
  }

  return "unknown";
}

function getTechnicalDetail(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  const message = asErrorLike(error).message;
  if (typeof message === "string") {
    return message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "No technical detail was provided.";
}

function getStatus(error: unknown, technicalDetail: string): number | null {
  const status = asErrorLike(error).status;
  if (typeof status === "number") {
    return status;
  }

  const match = technicalDetail.match(/\bstatus\s+(\d{3})\b/i);
  return match ? Number(match[1]) : null;
}

function getErrorKind(error: unknown): string {
  const kind = asErrorLike(error).kind;
  return typeof kind === "string" ? kind : "";
}

function getResponseBody(error: unknown): string {
  const responseBody = asErrorLike(error).responseBody;
  return typeof responseBody === "string" ? responseBody : "";
}

function asErrorLike(error: unknown): ErrorLike {
  return error !== null && typeof error === "object" ? (error as ErrorLike) : {};
}
