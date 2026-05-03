import { createHash, randomBytes, randomInt } from "node:crypto";

import type { PlatformRepository, User } from "@chat-to-image/platform-db";

export type SendVerificationCode = (message: { email: string; code: string }) => Promise<void>;
export type HashCode = (code: string, email: string) => string;
export type HashToken = (token: string) => string;

export type AuthServiceOptions = {
  generateCode?: () => string;
  generateToken?: () => string;
  hashCode?: HashCode;
  hashToken?: HashToken;
  sendCode?: SendVerificationCode;
  codeTtlMs?: number;
  sessionTtlMs?: number;
  resendCooldownMs?: number;
  maxAttempts?: number;
};

export type IssueEmailVerificationCodeInput = AuthServiceOptions & {
  repo: PlatformRepository;
  email: string;
  ipAddress?: string | null;
  now: Date;
};

export type VerifyEmailCodeInput = AuthServiceOptions & {
  repo: PlatformRepository;
  email: string;
  code: string;
  now: Date;
};

export type DisableUserInput = {
  repo: PlatformRepository;
  adminUserId: string;
  userId: string;
  disabled: boolean;
};

export type VerifyEmailCodeResult = {
  user: User;
  sessionToken: string;
};

const DEFAULT_CODE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_RESEND_COOLDOWN_MS = 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 5;

export async function issueEmailVerificationCode(input: IssueEmailVerificationCodeInput) {
  const email = normalizeEmail(input.email);
  if (!email) {
    throw new Error("Email is required.");
  }

  const latest = await input.repo.getLatestEmailVerificationCode(email);
  const resendCooldownMs = input.resendCooldownMs ?? DEFAULT_RESEND_COOLDOWN_MS;
  if (latest && latest.usedAt === null && input.now.getTime() - latest.createdAt.getTime() < resendCooldownMs) {
    throw new Error("Verification code was sent recently. Please wait before requesting another code.");
  }

  const code = (input.generateCode ?? defaultGenerateCode)();
  const hashCode = input.hashCode ?? defaultHashCode;
  const sendCode = input.sendCode ?? defaultSendCode;
  const expiresAt = new Date(input.now.getTime() + (input.codeTtlMs ?? DEFAULT_CODE_TTL_MS));

  const stored = await input.repo.createEmailVerificationCode({
    email,
    codeHash: hashCode(code, email),
    expiresAt,
    ipAddress: input.ipAddress ?? null,
  });

  await sendCode({ email, code });

  return {
    id: stored.id,
    email,
    expiresAt,
  };
}

export async function verifyEmailCodeAndCreateSession(input: VerifyEmailCodeInput): Promise<VerifyEmailCodeResult> {
  const email = normalizeEmail(input.email);
  const latest = await input.repo.getLatestEmailVerificationCode(email);

  if (!latest || latest.usedAt !== null || latest.expiresAt.getTime() <= input.now.getTime()) {
    throw new Error("Verification code is expired or missing.");
  }

  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  if (latest.attempts >= maxAttempts) {
    throw new Error("Too many verification attempts.");
  }

  const hashCode = input.hashCode ?? defaultHashCode;
  if (latest.codeHash !== hashCode(input.code, email)) {
    const updated = await input.repo.incrementEmailVerificationCodeAttempts(latest.id);
    if (updated.attempts >= maxAttempts) {
      throw new Error("Too many verification attempts.");
    }

    throw new Error("Invalid verification code.");
  }

  await input.repo.markEmailVerificationCodeUsed(latest.id, input.now);
  let user = await input.repo.getUserByEmail(email);
  if (!user) {
    user = await input.repo.createUser({ email });
  }

  if (user.disabled) {
    throw new Error("User is disabled.");
  }

  const sessionToken = (input.generateToken ?? defaultGenerateToken)();
  const hashToken = input.hashToken ?? defaultHashToken;
  await input.repo.createSession({
    userId: user.id,
    tokenHash: hashToken(sessionToken),
    expiresAt: new Date(input.now.getTime() + (input.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS)),
  });

  return { user, sessionToken };
}

export async function disableUser(input: DisableUserInput) {
  const user = await input.repo.setUserDisabled(input.userId, input.disabled);
  await input.repo.recordAdminAuditLog({
    adminUserId: input.adminUserId,
    action: input.disabled ? "user.disable" : "user.enable",
    targetType: "user",
    targetId: input.userId,
    detail: { disabled: input.disabled },
  });
  return user;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function defaultGenerateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function defaultGenerateToken(): string {
  return randomBytes(32).toString("base64url");
}

function defaultHashCode(code: string, email: string): string {
  return sha256(`${email}:${code}`);
}

function defaultHashToken(token: string): string {
  return sha256(token);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function defaultSendCode(message: { email: string; code: string }) {
  console.info(`Verification code for ${message.email}: ${message.code}`);
}
