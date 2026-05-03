import { describe, expect, it } from "vitest";

import { validateProductionEnv } from "./productionEnv";

describe("productionEnv", () => {
  it("reports missing required production configuration", () => {
    const result = validateProductionEnv({ NODE_ENV: "production" });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("DATABASE_URL is required.");
    expect(result.errors).toContain("REDIS_URL is required.");
    expect(result.errors).toContain("SMTP_HOST is required.");
    expect(result.errors).toContain("PLATFORM_ADMIN_TOKEN is required.");
    expect(result.errors).toContain("At least one hosted API key is required.");
  });

  it("accepts the minimal production platform configuration", () => {
    const result = validateProductionEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://user:pass@127.0.0.1:5432/chat_to_image",
      REDIS_URL: "redis://127.0.0.1:6379",
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "465",
      SMTP_USER: "notice@example.com",
      SMTP_PASS: "secret",
      PLATFORM_ADMIN_TOKEN: "admin-secret",
      PLATFORM_API_KEYS: "sk-key-1,sk-key-2",
      PLATFORM_OUTPUT_DIR: "/opt/chat-to-image/shared/images",
    });

    expect(result).toEqual({ ok: true, errors: [] });
  });
});
