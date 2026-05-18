import { describe, expect, it } from "vitest";

import { createInMemoryPlatformRepository } from "@chat-to-image/platform-db/in-memory";
import {
  disableUser,
  issueEmailVerificationCode,
  verifyEmailCodeAndCreateSession,
} from "./authService";

const now = new Date(Date.UTC(2026, 4, 2, 12, 0, 0));

describe("authService", () => {
  it("issues a normalized email verification code and sends it through the injected sender", async () => {
    const repo = createInMemoryPlatformRepository();
    const sent: Array<{ email: string; code: string }> = [];

    const result = await issueEmailVerificationCode({
      repo,
      email: " Demo@Example.COM ",
      ipAddress: "127.0.0.1",
      now,
      generateCode: () => "123456",
      hashCode: (code, email) => `hash:${email}:${code}`,
      sendCode: async (message) => {
        sent.push(message);
      },
    });

    const stored = await repo.getLatestEmailVerificationCode("demo@example.com");

    expect(result.email).toBe("demo@example.com");
    expect(sent).toEqual([{ email: "demo@example.com", code: "123456" }]);
    expect(stored).toMatchObject({
      email: "demo@example.com",
      codeHash: "hash:demo@example.com:123456",
      ipAddress: "127.0.0.1",
    });
  });

  it("locks verification after repeated wrong codes", async () => {
    const repo = createInMemoryPlatformRepository();
    await issueEmailVerificationCode({
      repo,
      email: "demo@example.com",
      ipAddress: null,
      now,
      generateCode: () => "123456",
      hashCode: (code, email) => `hash:${email}:${code}`,
      sendCode: async () => undefined,
      maxAttempts: 2,
    });

    await expect(
      verifyEmailCodeAndCreateSession({
        repo,
        email: "demo@example.com",
        code: "000000",
        now,
        hashCode: (code, email) => `hash:${email}:${code}`,
        hashToken: (token) => `token:${token}`,
        maxAttempts: 2,
      }),
    ).rejects.toThrow("Invalid verification code.");

    await expect(
      verifyEmailCodeAndCreateSession({
        repo,
        email: "demo@example.com",
        code: "111111",
        now,
        hashCode: (code, email) => `hash:${email}:${code}`,
        hashToken: (token) => `token:${token}`,
        maxAttempts: 2,
      }),
    ).rejects.toThrow("Too many verification attempts.");
  });

  it("creates a user and session after successful verification", async () => {
    const repo = createInMemoryPlatformRepository();
    await issueEmailVerificationCode({
      repo,
      email: "demo@example.com",
      ipAddress: null,
      now,
      generateCode: () => "123456",
      hashCode: (code, email) => `hash:${email}:${code}`,
      sendCode: async () => undefined,
    });

    const result = await verifyEmailCodeAndCreateSession({
      repo,
      email: "demo@example.com",
      code: "123456",
      now,
      generateToken: () => "session-token",
      hashCode: (code, email) => `hash:${email}:${code}`,
      hashToken: (token) => `token:${token}`,
    });

    expect(result.user).toMatchObject({ email: "demo@example.com", disabled: false });
    expect(result.sessionToken).toBe("session-token");
    await expect(repo.getSessionByTokenHash("token:session-token")).resolves.toMatchObject({
      userId: result.user.id,
      revokedAt: null,
    });
  });

  it("rejects login for disabled users and lets admins disable users", async () => {
    const repo = createInMemoryPlatformRepository();
    const user = await repo.createUser({ email: "demo@example.com" });
    const disabled = await disableUser({ repo, adminUserId: "admin-1", userId: user.id, disabled: true });

    await issueEmailVerificationCode({
      repo,
      email: "demo@example.com",
      ipAddress: null,
      now,
      generateCode: () => "123456",
      hashCode: (code, email) => `hash:${email}:${code}`,
      sendCode: async () => undefined,
    });

    await expect(
      verifyEmailCodeAndCreateSession({
        repo,
        email: "demo@example.com",
        code: "123456",
        now,
        hashCode: (code, email) => `hash:${email}:${code}`,
        hashToken: (token) => `token:${token}`,
      }),
    ).rejects.toThrow("User is disabled.");
    expect(disabled.disabled).toBe(true);
  });
});
