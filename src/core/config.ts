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

type MaybeConfig = Partial<Record<keyof AppConfig, unknown>>;

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
  const merged: AppConfig = { ...DEFAULT_CONFIG };

  for (const [key, fieldValue] of Object.entries(value ?? {}) as [keyof AppConfig, AppConfig[keyof AppConfig]][]) {
    if (fieldValue !== undefined) {
      merged[key] = fieldValue;
    }
  }

  merged.baseUrl = normalizeBaseUrl(asString(merged.baseUrl));

  return merged;
}

export function validateConfig(config: AppConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const maybeConfig = config as MaybeConfig;
  const baseUrl = asString(maybeConfig.baseUrl);
  const apiKey = asString(maybeConfig.apiKey);
  const textModel = asString(maybeConfig.textModel);
  const imageModel = asString(maybeConfig.imageModel);
  const outputDirectory = asString(maybeConfig.outputDirectory);
  const timeoutSeconds = maybeConfig.timeoutSeconds;
  const defaultCount = maybeConfig.defaultCount;

  try {
    new URL(normalizeBaseUrl(baseUrl));
  } catch {
    errors.push("Base URL must be a valid URL.");
  }

  if (!apiKey.trim()) {
    errors.push("API key is required.");
  }

  if (!textModel.trim()) {
    errors.push("Text model is required.");
  }

  if (!imageModel.trim()) {
    errors.push("Image model is required.");
  }

  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds < 180) {
    errors.push("Timeout must be at least 180 seconds.");
  }

  if (!Number.isInteger(defaultCount) || defaultCount < 1 || defaultCount > 4) {
    errors.push("Image count must be between 1 and 4.");
  }

  if (!outputDirectory.trim()) {
    warnings.push("Output directory is empty; the app will use outputs/.");
  }

  return { errors, warnings };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
