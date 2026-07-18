import { describe, expect, it } from "vitest";
import {
  MAX_PROVIDER_PROFILES,
  addProviderProfile,
  migrateProviderProfiles,
  removeProviderProfile,
  resolveActiveProviderProfile,
  upsertProviderProfile,
  type ProviderProfile,
} from "./providerProfiles";

const profile = (id: string, name = id): ProviderProfile => ({
  id,
  name,
  baseUrl: `https://${id}.example/v1`,
  apiKey: "test-key-a",
  textModel: "text-model",
  imageModel: "image-model",
  imageResponseMode: "official",
  rememberApiKey: false,
});

describe("provider profile domain", () => {
  it("migrates legacy fields to a Chinese default profile without persisting apiKey", () => {
    const migrated = migrateProviderProfiles({
      baseUrl: "https://legacy.example/v1",
      apiKey: "test-key-a",
      textModel: "legacy-text",
      imageModel: "legacy-image",
      imageResponseMode: "official",
      rememberApiKey: true,
      uiLanguage: "zh-CN",
    });

    expect(migrated).toEqual({
      providerSchemaVersion: 1,
      activeProviderProfileId: "provider-default",
      providerProfiles: [{
        id: "provider-default",
        name: "默认供应商",
        baseUrl: "https://legacy.example/v1",
        textModel: "legacy-text",
        imageModel: "legacy-image",
        imageResponseMode: "official",
        rememberApiKey: true,
      }],
    });
    expect(migrated.providerProfiles[0]).not.toHaveProperty("apiKey");
  });

  it("is idempotent and preserves an existing schema", () => {
    const value = {
      providerSchemaVersion: 1,
      activeProviderProfileId: "custom",
      providerProfiles: [{ ...profile("custom"), apiKey: undefined }],
    };
    expect(migrateProviderProfiles(value)).toBe(value);
  });

  it("resolves a valid active profile and falls back to the first profile", () => {
    const profiles = [profile("a"), profile("b")];
    expect(resolveActiveProviderProfile(profiles, "b")).toBe(profiles[1]);
    expect(resolveActiveProviderProfile(profiles, "missing")).toBe(profiles[0]);
  });

  it("adds and upserts profiles immutably with unique ids and names", () => {
    const profiles = [profile("a")];
    const added = addProviderProfile(profiles, profile("b", "Provider B"));
    expect(added).toHaveLength(2);
    expect(() => addProviderProfile(profiles, profile("a", "Other"))).toThrow("unique");
    expect(() => addProviderProfile(Array.from({ length: MAX_PROVIDER_PROFILES }, (_, i) => profile(String(i))), profile("new"))).toThrow("maximum");
    expect(upsertProviderProfile(profiles, profile("a", "Updated"))[0].name).toBe("Updated");
    expect(upsertProviderProfile(profiles, profile("b"))).toHaveLength(2);
  });

  it("does not remove the final profile", () => {
    expect(removeProviderProfile([profile("a"), profile("b")], "a")).toEqual([profile("b")]);
    expect(() => removeProviderProfile([profile("a")], "a")).toThrow("at least one");
  });
});
