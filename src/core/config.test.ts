import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  mergeConfig,
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

describe("mergeConfig", () => {
  it("normalizes a host-only base URL in the merged config", () => {
    expect(mergeConfig({ baseUrl: "https://ruoli.dev" }).baseUrl).toBe("https://ruoli.dev/v1");
  });

  it("does not let undefined partial values wipe defaults", () => {
    const merged = mergeConfig({
      baseUrl: undefined,
      textModel: undefined,
      timeoutSeconds: undefined,
    } as Partial<AppConfig>);

    expect(merged.baseUrl).toBe(DEFAULT_CONFIG.baseUrl);
    expect(merged.textModel).toBe(DEFAULT_CONFIG.textModel);
    expect(merged.timeoutSeconds).toBe(DEFAULT_CONFIG.timeoutSeconds);
  });

  it("returns a config that validateConfig can handle even with undefined-like partial input", () => {
    const merged = mergeConfig({
      apiKey: "sk-local",
      outputDirectory: undefined,
      imageModel: undefined,
    } as Partial<AppConfig>);

    expect(() => validateConfig(merged)).not.toThrow();
    expect(validateConfig(merged).errors).toEqual([]);
  });
});
