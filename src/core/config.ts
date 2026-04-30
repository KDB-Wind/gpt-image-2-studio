export type AppConfig = {
  baseUrl: string;
  apiKey: string;
  textModel: string;
  imageModel: string;
  timeoutSeconds: number;
  outputDirectory: string;
  defaultSize: string;
  defaultCount: number;
  defaultQuality: string;
  defaultFormat: "png" | "jpeg" | "webp";
};

export type ValidationResult = {
  errors: string[];
  warnings: string[];
};

export const DEFAULT_CONFIG: AppConfig = {
  baseUrl: "https://ruoli.dev/v1",
  apiKey: "",
  textModel: "gpt-5.4-mini",
  imageModel: "gpt-image-2",
  timeoutSeconds: 180,
  outputDirectory: "outputs",
  defaultSize: "1024x1024",
  defaultCount: 1,
  defaultQuality: "auto",
  defaultFormat: "png",
};

export function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/v1")) {
    return trimmed;
  }

  return `${trimmed}/v1`;
}

export function mergeConfig(value: Partial<AppConfig> | null | undefined): AppConfig {
  return {
    ...DEFAULT_CONFIG,
    ...(value ?? {}),
  };
}

export function validateConfig(config: AppConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    new URL(normalizeBaseUrl(config.baseUrl));
  } catch {
    errors.push("Base URL must be a valid URL.");
  }

  if (!config.apiKey.trim()) {
    errors.push("API key is required.");
  }

  if (!config.textModel.trim()) {
    errors.push("Text model is required.");
  }

  if (!config.imageModel.trim()) {
    errors.push("Image model is required.");
  }

  if (!Number.isFinite(config.timeoutSeconds) || config.timeoutSeconds < 180) {
    errors.push("Timeout must be at least 180 seconds.");
  }

  if (!Number.isInteger(config.defaultCount) || config.defaultCount < 1 || config.defaultCount > 4) {
    errors.push("Image count must be between 1 and 4.");
  }

  if (!config.outputDirectory.trim()) {
    warnings.push("Output directory is empty; the app will use outputs/.");
  }

  return { errors, warnings };
}
