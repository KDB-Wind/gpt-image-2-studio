export type VerificationRequestRateLimitInput = {
  email: string;
  ipAddress?: string | null;
};

export type VerificationRequestRateLimiter = (
  input: VerificationRequestRateLimitInput,
) => Promise<void>;

export type VerificationRequestRateLimiterOptions = {
  windowMs?: number;
  maxPerEmail?: number;
  maxPerIp?: number;
  now?: () => number;
};

const DEFAULT_WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_MAX_PER_EMAIL = 5;
const DEFAULT_MAX_PER_IP = 20;

export function createVerificationRequestRateLimiter(
  options: VerificationRequestRateLimiterOptions = {},
): VerificationRequestRateLimiter {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const maxPerEmail = options.maxPerEmail ?? DEFAULT_MAX_PER_EMAIL;
  const maxPerIp = options.maxPerIp ?? DEFAULT_MAX_PER_IP;
  const now = options.now ?? (() => Date.now());
  const emailRequests = new Map<string, number[]>();
  const ipRequests = new Map<string, number[]>();

  return async ({ email, ipAddress }) => {
    const timestamp = now();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedIp = ipAddress?.trim();

    recordOrThrow(emailRequests, normalizedEmail, timestamp, windowMs, maxPerEmail, "email");
    if (normalizedIp) {
      recordOrThrow(ipRequests, normalizedIp, timestamp, windowMs, maxPerIp, "network");
    }
  };
}

function recordOrThrow(
  records: Map<string, number[]>,
  key: string,
  timestamp: number,
  windowMs: number,
  max: number,
  label: "email" | "network",
) {
  const recent = (records.get(key) ?? []).filter((item) => timestamp - item < windowMs);
  if (recent.length >= max) {
    const scope = label === "network" ? "from this network" : "for this email";
    throw new Error(`Too many verification code requests ${scope}. Please try again later.`);
  }

  records.set(key, [...recent, timestamp]);
}
