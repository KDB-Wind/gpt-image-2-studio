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

  it("accepts the bundled size, quality, format, and compression settings", () => {
    expect(
      validateConfig({
        ...valid,
        defaultSize: "2048x1152",
        defaultQuality: "high",
        defaultFormat: "webp",
        defaultCompression: 90,
      }).errors,
    ).toEqual([]);
  });

  it("requires an API key before network calls", () => {
    expect(validateConfig({ ...valid, apiKey: "" }).errors).toContain("API key is required.");
  });

  it("accepts 120 seconds but warns when timeout is below the recommended 180 seconds", () => {
    const result = validateConfig({ ...valid, timeoutSeconds: 120 });

    expect(result.errors).not.toContain("Timeout must be at least 180 seconds.");
    expect(result.warnings).toContain("Timeout below 180 seconds may interrupt slow 2K or 4K generations.");
  });

  it("requires a timeout of at least 60 seconds", () => {
    expect(validateConfig({ ...valid, timeoutSeconds: 59 }).errors).toContain(
      "Timeout must be between 60 and 600 seconds.",
    );
  });

  it("requires a timeout no higher than 600 seconds", () => {
    expect(validateConfig({ ...valid, timeoutSeconds: 601 }).errors).toContain(
      "Timeout must be between 60 and 600 seconds.",
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

  it("rejects invalid custom image sizes", () => {
    const result = validateConfig({ ...valid, defaultSize: "1025x1024" });
    expect(result.errors).toContain("Image size width and height must both be multiples of 16.");
  });

  it("rejects unsupported quality, format, and compression values", () => {
    const result = validateConfig({
      ...valid,
      defaultQuality: "ultra" as AppConfig["defaultQuality"],
      defaultFormat: "gif" as AppConfig["defaultFormat"],
      defaultCompression: 120,
    });

    expect(result.errors).toContain("Image quality must be auto, low, medium, or high.");
    expect(result.errors).toContain("Image format must be png, jpeg, or webp.");
    expect(result.errors).toContain("Output compression must be an integer between 0 and 100.");
  });

  it("warns when the selected size is high resolution", () => {
    const result = validateConfig({ ...valid, defaultSize: "3840x2160" });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toContain(
      "High-resolution sizes can take longer and may not be supported by every compatible provider.",
    );
  });
});

describe("mergeConfig", () => {
  it("normalizes a host-only base URL in the merged config", () => {
    expect(mergeConfig({ baseUrl: "https://ruoli.dev" }).baseUrl).toBe("https://ruoli.dev/v1");
  });

  it("starts with Chinese UI and an undisposed welcome guide", () => {
    expect(DEFAULT_CONFIG.uiLanguage).toBe("zh-CN");
    expect(DEFAULT_CONFIG.hasDismissedWelcome).toBe(false);
  });

  it("keeps explicit UI preferences when merging saved config", () => {
    const merged = mergeConfig({
      uiLanguage: "en-US",
      hasDismissedWelcome: true,
    });

    expect(merged.uiLanguage).toBe("en-US");
    expect(merged.hasDismissedWelcome).toBe(true);
  });

  it("does not let undefined partial values wipe defaults", () => {
    const merged = mergeConfig({
      baseUrl: undefined,
      textModel: undefined,
      timeoutSeconds: undefined,
      uiLanguage: undefined,
      hasDismissedWelcome: undefined,
    } as Partial<AppConfig>);

    expect(merged.baseUrl).toBe(DEFAULT_CONFIG.baseUrl);
    expect(merged.textModel).toBe(DEFAULT_CONFIG.textModel);
    expect(merged.timeoutSeconds).toBe(DEFAULT_CONFIG.timeoutSeconds);
    expect(merged.uiLanguage).toBe(DEFAULT_CONFIG.uiLanguage);
    expect(merged.hasDismissedWelcome).toBe(DEFAULT_CONFIG.hasDismissedWelcome);
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

  it("keeps the default compression when merging saved config", () => {
    expect(mergeConfig({ defaultCompression: 72 }).defaultCompression).toBe(72);
    expect(mergeConfig({ defaultCompression: undefined } as Partial<AppConfig>).defaultCompression).toBe(
      DEFAULT_CONFIG.defaultCompression,
    );
  });

  it("includes local batch generation defaults", () => {
    expect(DEFAULT_CONFIG.batchDefaultTaskCount).toBe(5);
    expect(DEFAULT_CONFIG.batchDefaultConcurrency).toBe(1);
    expect(DEFAULT_CONFIG.batchDefaultIntervalSeconds).toBe(20);
    expect(DEFAULT_CONFIG.batchDefaultMaxRetries).toBe(1);
    expect(DEFAULT_CONFIG.batchLastSplitTemplateId).toBe("basic");
    expect(DEFAULT_CONFIG.batchCustomSplitSystemPrompt).toBe("");
    expect(DEFAULT_CONFIG.batchAutoPlanTaskCount).toBe(true);
  });

  it("normalizes invalid batch settings while merging config", () => {
    const merged = mergeConfig({
      batchDefaultTaskCount: 42,
      batchDefaultConcurrency: 42,
      batchDefaultIntervalSeconds: -1,
      batchDefaultMaxRetries: 6,
      batchLastSplitTemplateId: 123 as never,
      batchCustomSplitSystemPrompt: 100 as never,
      batchAutoPlanTaskCount: "yes" as never,
    });

    expect(merged.batchDefaultTaskCount).toBe(20);
    expect(merged.batchDefaultConcurrency).toBe(10);
    expect(merged.batchDefaultIntervalSeconds).toBe(0);
    expect(merged.batchDefaultMaxRetries).toBe(3);
    expect(merged.batchLastSplitTemplateId).toBe("basic");
    expect(merged.batchCustomSplitSystemPrompt).toBe("");
    expect(merged.batchAutoPlanTaskCount).toBe(true);
  });

  it("allows five as a saved batch concurrency value", () => {
    expect(mergeConfig({ batchDefaultConcurrency: 5 }).batchDefaultConcurrency).toBe(5);
  });

  it("keeps an explicit disabled AI task count planning setting", () => {
    expect(mergeConfig({ batchAutoPlanTaskCount: false }).batchAutoPlanTaskCount).toBe(false);
  });
});
