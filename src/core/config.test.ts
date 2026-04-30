import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  normalizeBaseUrl,
  validateConfig,
  type AppConfig,
} from "./config";

describe("normalizeBaseUrl", () => {
  it("adds /v1 when the user enters the host only", () => {
    expect(normalizeBaseUrl("https://ruoli.dev")).toBe("https://ruoli.dev/v1");
  });

  it("keeps an existing /v1 suffix", () => {
    expect(normalizeBaseUrl("https://ruoli.dev/v1")).toBe("https://ruoli.dev/v1");
  });

  it("removes trailing slashes before normalizing", () => {
    expect(normalizeBaseUrl("https://ruoli.dev///")).toBe("https://ruoli.dev/v1");
  });
});

describe("validateConfig", () => {
  const valid: AppConfig = {
    ...DEFAULT_CONFIG,
    apiKey: "sk-local",
  };

  it("accepts the default ruoli.dev settings when an API key is present", () => {
    expect(validateConfig(valid).errors).toEqual([]);
  });

  it("requires an API key before network calls", () => {
    expect(validateConfig({ ...valid, apiKey: "" }).errors).toContain("API key is required.");
  });

  it("requires a timeout of at least 180 seconds", () => {
    expect(validateConfig({ ...valid, timeoutSeconds: 120 }).errors).toContain(
      "Timeout must be at least 180 seconds.",
    );
  });

  it("requires model names", () => {
    const result = validateConfig({ ...valid, textModel: "", imageModel: "" });
    expect(result.errors).toContain("Text model is required.");
    expect(result.errors).toContain("Image model is required.");
  });

  it("warns but does not error when output directory is empty", () => {
    const result = validateConfig({ ...valid, outputDirectory: "" });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toContain("Output directory is empty; the app will use outputs/.");
  });
});
