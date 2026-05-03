import { describe, expect, it } from "vitest";

import { createVerificationRequestRateLimiter } from "./authRateLimit";

describe("authRateLimit", () => {
  it("blocks repeated verification requests by email and IP in the configured window", async () => {
    const now = Date.UTC(2026, 4, 3, 10, 0, 0);
    const limiter = createVerificationRequestRateLimiter({
      windowMs: 60_000,
      maxPerEmail: 2,
      maxPerIp: 2,
      now: () => now,
    });

    await limiter({ email: "demo@example.com", ipAddress: "127.0.0.1" });
    await limiter({ email: "demo@example.com", ipAddress: "127.0.0.2" });
    await expect(limiter({ email: "demo@example.com", ipAddress: "127.0.0.3" })).rejects.toThrow(
      "Too many verification code requests for this email",
    );

    await limiter({ email: "other-1@example.com", ipAddress: "127.0.0.1" });
    await expect(limiter({ email: "other-2@example.com", ipAddress: "127.0.0.1" })).rejects.toThrow(
      "Too many verification code requests from this network",
    );
  });
});
