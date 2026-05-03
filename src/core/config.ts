export type UiLanguage = "zh-CN" | "en-US";

import {
  isImageOutputFormat,
  isImageQuality,
  validateImageSize,
  type ImageOutputFormat,
  type ImageQuality,
} from "./imageOptions";

export type AppConfig = {
  baseUrl: string;
  apiKey: string;
  textModel: string;
  imageModel: string;
  timeoutSeconds: number;
  outputDirectory: string;
  defaultSize: string;
  defaultCount: number;
  defaultQuality: ImageQuality;
  defaultFormat: ImageOutputFormat;
  defaultCompression: number;
  uiLanguage: UiLanguage;
  hasDismissedWelcome: boolean;
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
  defaultCompression: 90,
  uiLanguage: "zh-CN",
  hasDismissedWelcome: false,
};

export function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/v1")) {
    return trimmed;
  }

  return `${trimmed}/v1`;
}

export function mergeConfig(value: Partial<AppConfig> | null | undefined): AppConfig {
  const merged: AppConfig = {
    ...DEFAULT_CONFIG,
    ...(Object.fromEntries(
      Object.entries(value ?? {}).filter(([, fieldValue]) => fieldValue !== undefined),
    ) as Partial<AppConfig>),
  };

  merged.baseUrl = normalizeBaseUrl(asString(merged.baseUrl) || DEFAULT_CONFIG.baseUrl);
  merged.uiLanguage = isUiLanguage(merged.uiLanguage) ? merged.uiLanguage : DEFAULT_CONFIG.uiLanguage;
  merged.hasDismissedWelcome = asBoolean(merged.hasDismissedWelcome, DEFAULT_CONFIG.hasDismissedWelcome);

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
  const timeoutSeconds = asNumber(maybeConfig.timeoutSeconds);
  const defaultCount = asNumber(maybeConfig.defaultCount);
  const defaultQuality = asString(maybeConfig.defaultQuality);
  const defaultFormat = asString(maybeConfig.defaultFormat);
  const defaultCompression = asNumber(maybeConfig.defaultCompression);
  const imageSizeValidation = validateImageSize(asString(maybeConfig.defaultSize));

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

  if (imageSizeValidation.error) {
    errors.push(imageSizeValidation.error);
  }

  if (!isImageQuality(defaultQuality)) {
    errors.push("Image quality must be auto, low, medium, or high.");
  }

  if (!isImageOutputFormat(defaultFormat)) {
    errors.push("Image format must be png, jpeg, or webp.");
  }

  if (!Number.isInteger(defaultCompression) || defaultCompression < 0 || defaultCompression > 100) {
    errors.push("Output compression must be an integer between 0 and 100.");
  }

  if (!outputDirectory.trim()) {
    warnings.push("Output directory is empty; the app will use outputs/.");
  }

  if (imageSizeValidation.warning) {
    warnings.push(imageSizeValidation.warning);
  }

  return { errors, warnings };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number {
  return typeof value === "number" ? value : Number.NaN;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function isUiLanguage(value: unknown): value is UiLanguage {
  return value === "zh-CN" || value === "en-US";
}
