export type UiLanguage = "zh-CN" | "en-US";
export type ImageResponseMode = "official" | "force-base64";

import {
  DEFAULT_BATCH_TASK_COUNT,
  DEFAULT_BATCH_EXECUTION_CONFIG,
  clampBatchTaskCount,
  clampBatchExecutionConfig,
  type BatchSplitTemplateId,
} from "./batchTypes";
import {
  isImageOutputFormat,
  isImageQuality,
  validateImageSize,
  type ImageOutputFormat,
  type ImageQuality,
} from "./imageOptions";
import {
  migrateProviderProfiles,
  PROVIDER_SCHEMA_VERSION,
  resolveActiveProviderProfile,
  type ProviderProfile,
  type ProviderProfileMetadata,
} from "./providerProfiles";

export type AppConfig = {
  baseUrl: string;
  apiKey: string;
  rememberApiKey: boolean;
  textModel: string;
  imageModel: string;
  timeoutSeconds: number;
  outputDirectory: string;
  defaultSize: string;
  defaultCount: number;
  defaultQuality: ImageQuality;
  defaultFormat: ImageOutputFormat;
  defaultCompression: number;
  imageResponseMode: ImageResponseMode;
  uiLanguage: UiLanguage;
  hasDismissedWelcome: boolean;
  batchDefaultTaskCount: number;
  batchDefaultConcurrency: number;
  batchDefaultIntervalSeconds: number;
  batchDefaultMaxRetries: number;
  batchAutoPlanTaskCount: boolean;
  batchCustomSplitSystemPrompt: string;
  batchLastSplitTemplateId: BatchSplitTemplateId;
  providerSchemaVersion: typeof PROVIDER_SCHEMA_VERSION;
  activeProviderProfileId: string;
  providerProfiles: ProviderProfile[];
};

export type ValidationResult = {
  errors: string[];
  warnings: string[];
};

type MaybeConfig = Partial<Record<keyof AppConfig, unknown>>;

export const DEFAULT_CONFIG: AppConfig = {
  baseUrl: "https://ruoli.dev/v1",
  apiKey: "",
  rememberApiKey: false,
  textModel: "gpt-5.4-mini",
  imageModel: "gpt-image-2",
  timeoutSeconds: 180,
  outputDirectory: "outputs",
  defaultSize: "1024x1024",
  defaultCount: 1,
  defaultQuality: "auto",
  defaultFormat: "png",
  defaultCompression: 90,
  imageResponseMode: "official",
  uiLanguage: "zh-CN",
  hasDismissedWelcome: false,
  batchDefaultTaskCount: DEFAULT_BATCH_TASK_COUNT,
  batchDefaultConcurrency: DEFAULT_BATCH_EXECUTION_CONFIG.concurrency,
  batchDefaultIntervalSeconds: DEFAULT_BATCH_EXECUTION_CONFIG.intervalSeconds,
  batchDefaultMaxRetries: DEFAULT_BATCH_EXECUTION_CONFIG.maxRetries,
  batchAutoPlanTaskCount: true,
  batchCustomSplitSystemPrompt: "",
  batchLastSplitTemplateId: "basic",
  providerSchemaVersion: PROVIDER_SCHEMA_VERSION,
  activeProviderProfileId: "provider-default",
  providerProfiles: [{
    id: "provider-default",
    name: "默认供应商",
    baseUrl: "https://ruoli.dev/v1",
    apiKey: "",
    textModel: "gpt-5.4-mini",
    imageModel: "gpt-image-2",
    imageResponseMode: "official",
    rememberApiKey: false,
  }],
};

export function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/v1")) {
    return trimmed;
  }

  return `${trimmed}/v1`;
}

export function mergeConfig(value: Partial<AppConfig> | null | undefined): AppConfig {
  const input = (value ?? {}) as Record<string, unknown>;
  const merged: AppConfig = {
    ...DEFAULT_CONFIG,
    ...(Object.fromEntries(
      Object.entries(value ?? {}).filter(([, fieldValue]) => fieldValue !== undefined),
    ) as Partial<AppConfig>),
  };

  merged.baseUrl = normalizeBaseUrl(asString(merged.baseUrl) || DEFAULT_CONFIG.baseUrl);
  merged.defaultCount = 1;
  merged.imageResponseMode = isImageResponseMode(merged.imageResponseMode)
    ? merged.imageResponseMode
    : DEFAULT_CONFIG.imageResponseMode;
  merged.uiLanguage = isUiLanguage(merged.uiLanguage) ? merged.uiLanguage : DEFAULT_CONFIG.uiLanguage;
  merged.rememberApiKey = asBoolean(merged.rememberApiKey, DEFAULT_CONFIG.rememberApiKey);
  merged.hasDismissedWelcome = asBoolean(merged.hasDismissedWelcome, DEFAULT_CONFIG.hasDismissedWelcome);
  merged.batchDefaultTaskCount = clampBatchTaskCount(asNumber(merged.batchDefaultTaskCount));
  const batchExecutionConfig = clampBatchExecutionConfig({
    concurrency: asNumber(merged.batchDefaultConcurrency),
    intervalSeconds: asNumber(merged.batchDefaultIntervalSeconds),
    maxRetries: asNumber(merged.batchDefaultMaxRetries),
  });
  merged.batchDefaultConcurrency = batchExecutionConfig.concurrency;
  merged.batchDefaultIntervalSeconds = batchExecutionConfig.intervalSeconds;
  merged.batchDefaultMaxRetries = batchExecutionConfig.maxRetries;
  merged.batchAutoPlanTaskCount = asBoolean(merged.batchAutoPlanTaskCount, DEFAULT_CONFIG.batchAutoPlanTaskCount);
  merged.batchCustomSplitSystemPrompt = asString(merged.batchCustomSplitSystemPrompt);
  merged.batchLastSplitTemplateId = isBatchSplitTemplateId(merged.batchLastSplitTemplateId)
    ? merged.batchLastSplitTemplateId
    : DEFAULT_CONFIG.batchLastSplitTemplateId;

  const inputHasSchema = Array.isArray(input.providerProfiles)
    && (input.providerSchemaVersion === PROVIDER_SCHEMA_VERSION || typeof input.activeProviderProfileId === "string");
  const migrationInput = inputHasSchema
    ? { ...input, providerSchemaVersion: PROVIDER_SCHEMA_VERSION, uiLanguage: merged.uiLanguage }
    : { ...input, uiLanguage: merged.uiLanguage };
  const migrated = migrateProviderProfiles(migrationInput);
  const inputProfiles = Array.isArray(input.providerProfiles) ? input.providerProfiles : [];
  const profiles = migrated.providerProfiles.map((profile: ProviderProfileMetadata) => {
    const source = inputProfiles.find((candidate) => isRecord(candidate) && candidate.id === profile.id);
    const sourceApiKey = isRecord(source) ? asString(source.apiKey) : "";
    return {
      ...profile,
      baseUrl: normalizeBaseUrl(profile.baseUrl),
      apiKey: inputHasSchema ? sourceApiKey : asString(input.apiKey),
    };
  });
  const active = resolveActiveProviderProfile(profiles, migrated.activeProviderProfileId);
  merged.providerSchemaVersion = PROVIDER_SCHEMA_VERSION;
  merged.providerProfiles = profiles;
  merged.activeProviderProfileId = active.id;
  merged.baseUrl = active.baseUrl;
  merged.apiKey = active.apiKey;
  merged.textModel = active.textModel;
  merged.imageModel = active.imageModel;
  merged.imageResponseMode = active.imageResponseMode;
  merged.rememberApiKey = active.rememberApiKey;

  return merged;
}

export function validateConfig(config: AppConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const maybeConfig = config as MaybeConfig;
  const activeProfile = resolveActiveProviderProfile(config.providerProfiles, config.activeProviderProfileId);
  const baseUrl = activeProfile.baseUrl;
  const apiKey = activeProfile.apiKey;
  const textModel = activeProfile.textModel;
  const imageModel = activeProfile.imageModel;
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

  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds < 60 || timeoutSeconds > 600) {
    errors.push("Timeout must be between 60 and 600 seconds.");
  } else if (timeoutSeconds < 180) {
    warnings.push("Timeout below 180 seconds may interrupt slow 2K or 4K generations.");
  }

  if (defaultCount !== 1) {
    errors.push("Image count must be exactly 1 per task.");
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isImageResponseMode(value: unknown): value is ImageResponseMode {
  return value === "official" || value === "force-base64";
}

function isBatchSplitTemplateId(value: unknown): value is BatchSplitTemplateId {
  return value === "basic" || value === "style-consistent" || value === "series" || value === "custom";
}
