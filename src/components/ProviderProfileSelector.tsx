import type { ProviderProfile } from "../core/providerProfiles";
import { getTranslations, type UiLanguage } from "../i18n/translations";

type ProviderProfileSelectorProps = {
  profiles: ProviderProfile[];
  activeProfileId: string;
  language: UiLanguage;
  testId: string;
  disabled?: boolean;
  onChange: (profileId: string) => void | Promise<void>;
};

export function ProviderProfileSelector({
  profiles,
  activeProfileId,
  language,
  testId,
  disabled = false,
  onChange,
}: ProviderProfileSelectorProps) {
  const copy = getTranslations(language);
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0];

  if (!activeProfile) {
    return null;
  }

  const responseModeLabel = activeProfile.imageResponseMode === "force-base64"
    ? copy.options.imageResponseModeForceBase64
    : copy.options.imageResponseModeOfficial;

  return (
    <div className="provider-quick-switcher">
      <label className="field provider-quick-switcher-field">
        <span>{copy.labels.activeProfile}</span>
        <select
          data-testid={testId}
          value={activeProfile.id}
          disabled={disabled}
          onChange={(event) => void onChange(event.currentTarget.value)}
        >
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>
      </label>
      <span className="provider-response-mode" title={copy.fields.imageResponseMode}>
        {responseModeLabel}
      </span>
    </div>
  );
}
