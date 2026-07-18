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
  if (isValidProviderProfilesState(value)) {
    return value;
  }

  const legacy = isRecord(value) ? (value as LegacyProviderConfig) : {};
  const isEnglish = legacy.uiLanguage === "en-US";
  if (isCurrentProviderSchema(value)) {
    const providerProfiles = normalizeProviderProfileMetadata(value.providerProfiles, isEnglish);
    const profiles = providerProfiles.length > 0 ? providerProfiles : [createDefaultProfile(isEnglish)];
    const activeProviderProfileId = profiles.some(({ id }) => id === value.activeProviderProfileId)
      ? value.activeProviderProfileId as string
      : profiles[0].id;

    return {
      providerSchemaVersion: PROVIDER_SCHEMA_VERSION,
      activeProviderProfileId,
      providerProfiles: profiles,
    };
  }

  const profile = createDefaultProfile(isEnglish, legacy);

  return {
    providerSchemaVersion: PROVIDER_SCHEMA_VERSION,
    activeProviderProfileId: profile.id,
    providerProfiles: [profile],
  };
}

function createDefaultProfile(
  isEnglish: boolean,
  legacy: LegacyProviderConfig = {},
): ProviderProfileMetadata {
  return {
    id: "provider-default",
    name: isEnglish ? "Default provider" : "默认供应商",
    baseUrl: stringOr(legacy.baseUrl, "https://ruoli.dev/v1"),
    textModel: stringOr(legacy.textModel, "gpt-5.4-mini"),
    imageModel: stringOr(legacy.imageModel, "gpt-image-2"),
    imageResponseMode: isImageResponseMode(legacy.imageResponseMode) ? legacy.imageResponseMode : "official",
    rememberApiKey: typeof legacy.rememberApiKey === "boolean" ? legacy.rememberApiKey : false,
  };
}

function normalizeProviderProfileMetadata(value: unknown, isEnglish: boolean): ProviderProfileMetadata[] {
  if (!Array.isArray(value)) return [];

  const profiles: ProviderProfileMetadata[] = [];
  const ids = new Set<string>();
  for (const [index, candidate] of value.entries()) {
    if (profiles.length >= MAX_PROVIDER_PROFILES) break;
    if (!isRecord(candidate)) continue;

    const requestedId = stringOr(candidate.id, `provider-${index + 1}`);
    if (ids.has(requestedId)) continue;
    ids.add(requestedId);
    profiles.push({
      id: requestedId,
      name: stringOr(candidate.name, isEnglish ? `Provider ${profiles.length + 1}` : `供应商 ${profiles.length + 1}`),
      baseUrl: stringOr(candidate.baseUrl, "https://ruoli.dev/v1"),
      textModel: stringOr(candidate.textModel, "gpt-5.4-mini"),
      imageModel: stringOr(candidate.imageModel, "gpt-image-2"),
      imageResponseMode: isImageResponseMode(candidate.imageResponseMode) ? candidate.imageResponseMode : "official",
      rememberApiKey: typeof candidate.rememberApiKey === "boolean" ? candidate.rememberApiKey : false,
    });
  }
  return profiles;
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

function isValidProviderProfilesState(value: unknown): value is ProviderProfilesState {
  if (!isCurrentProviderSchema(value)
    || typeof value.activeProviderProfileId !== "string"
    || value.providerProfiles.length < 1
    || value.providerProfiles.length > MAX_PROVIDER_PROFILES) {
    return false;
  }

  const ids = new Set<string>();
  for (const profile of value.providerProfiles) {
    if (!isRecord(profile)) return false;
    const id = typeof profile.id === "string" ? profile.id.trim() : "";
    const name = typeof profile.name === "string" ? profile.name.trim() : "";
    if (!id || !name || ids.has(id)
      || typeof profile.baseUrl !== "string"
      || typeof profile.textModel !== "string"
      || typeof profile.imageModel !== "string"
      || !isImageResponseMode(profile.imageResponseMode)
      || typeof profile.rememberApiKey !== "boolean") return false;
    ids.add(id);
  }
  return ids.has(value.activeProviderProfileId);
}

function isCurrentProviderSchema(value: unknown): value is Record<string, unknown> & { providerProfiles: unknown[] } {
  return isRecord(value)
    && value.providerSchemaVersion === PROVIDER_SCHEMA_VERSION
    && Array.isArray(value.providerProfiles);
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
