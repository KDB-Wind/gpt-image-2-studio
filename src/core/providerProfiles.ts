import type { ImageResponseMode } from "./config";

export const MAX_PROVIDER_PROFILES = 20;
export const PROVIDER_SCHEMA_VERSION = 1;

export type ProviderProfile = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  textModel: string;
  imageModel: string;
  imageResponseMode: ImageResponseMode;
  rememberApiKey: boolean;
};

export type ProviderProfileMetadata = Omit<ProviderProfile, "apiKey">;

export type ProviderProfilesState = {
  providerSchemaVersion: typeof PROVIDER_SCHEMA_VERSION;
  activeProviderProfileId: string;
  providerProfiles: ProviderProfileMetadata[];
};

type LegacyProviderConfig = Partial<ProviderProfile> & { uiLanguage?: unknown };

export function migrateProviderProfiles(value: unknown): ProviderProfilesState {
  if (isProviderProfilesState(value)) {
    return value;
  }

  const legacy = isRecord(value) ? (value as LegacyProviderConfig) : {};
  const isEnglish = legacy.uiLanguage === "en-US";
  const profile: ProviderProfileMetadata = {
    id: "provider-default",
    name: isEnglish ? "Default provider" : "默认供应商",
    baseUrl: stringOr(legacy.baseUrl, "https://ruoli.dev/v1"),
    textModel: stringOr(legacy.textModel, "gpt-5.4-mini"),
    imageModel: stringOr(legacy.imageModel, "gpt-image-2"),
    imageResponseMode: isImageResponseMode(legacy.imageResponseMode) ? legacy.imageResponseMode : "official",
    rememberApiKey: typeof legacy.rememberApiKey === "boolean" ? legacy.rememberApiKey : false,
  };

  return {
    providerSchemaVersion: PROVIDER_SCHEMA_VERSION,
    activeProviderProfileId: profile.id,
    providerProfiles: [profile],
  };
}

export function resolveActiveProviderProfile(
  profiles: readonly ProviderProfile[],
  activeId: string,
): ProviderProfile {
  if (profiles.length === 0) {
    throw new Error("At least one provider profile is required.");
  }
  return profiles.find((profile) => profile.id === activeId) ?? profiles[0];
}

export function addProviderProfile(
  profiles: readonly ProviderProfile[],
  profile: ProviderProfile,
): ProviderProfile[] {
  assertProfile(profile);
  if (profiles.length >= MAX_PROVIDER_PROFILES) {
    throw new Error(`The maximum of ${MAX_PROVIDER_PROFILES} provider profiles is allowed.`);
  }
  if (profiles.some((item) => item.id === profile.id)) {
    throw new Error("Provider profile id must be unique.");
  }
  return [...profiles, profile];
}

export function upsertProviderProfile(
  profiles: readonly ProviderProfile[],
  profile: ProviderProfile,
): ProviderProfile[] {
  assertProfile(profile);
  const index = profiles.findIndex((item) => item.id === profile.id);
  if (index < 0) {
    return addProviderProfile(profiles, profile);
  }
  return profiles.map((item, itemIndex) => (itemIndex === index ? profile : item));
}

export function removeProviderProfile(profiles: readonly ProviderProfile[], id: string): ProviderProfile[] {
  if (profiles.length <= 1) {
    throw new Error("at least one provider profile must remain.");
  }
  return profiles.filter((profile) => profile.id !== id);
}

function assertProfile(profile: ProviderProfile): void {
  if (!profile.id.trim()) throw new Error("Provider profile id must be unique.");
  if (!profile.name.trim()) throw new Error("Provider profile name is required.");
}

function isProviderProfilesState(value: unknown): value is ProviderProfilesState {
  return isRecord(value) && value.providerSchemaVersion === PROVIDER_SCHEMA_VERSION && Array.isArray(value.providerProfiles)
    && typeof value.activeProviderProfileId === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function isImageResponseMode(value: unknown): value is ImageResponseMode {
  return value === "official" || value === "force-base64";
}
