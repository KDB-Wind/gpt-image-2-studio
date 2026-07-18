import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";

import { useCallback } from "react";
import { AppLogo } from "./components/AppLogo";
import { BatchPanel } from "./components/BatchPanel";
import { ProviderProfileSelector } from "./components/ProviderProfileSelector";
import {
  generateImages,
  optimizePrompt,
  testImageEditModel,
  testImageModel,
  testTextModel,
} from "./core/apiClient";
import type { BatchPreviewImage, BatchPreviewState } from "./core/batchPreview";
import { DEFAULT_CONFIG, mergeConfig, type AppConfig, validateConfig } from "./core/config";
import { safeErrorMessage } from "./core/errorSanitizer";
import { MAX_BATCH_TASK_COUNT, clampBatchTaskCount, type ImageSaveMode } from "./core/batchTypes";
import {
  groupHistoryByDate,
  groupHistoryRecordsForDisplay,
  createProviderProfileSnapshot,
  getHistoryProviderLabel,
  type HistoryDisplayItem,
  type ImageRecord,
} from "./core/history";
import {
  MAX_PROVIDER_PROFILES,
  addProviderProfile,
  removeProviderProfile,
  resolveActiveProviderProfile,
  upsertProviderProfile,
  type ProviderProfile,
} from "./core/providerProfiles";
import {
  MAX_REFERENCE_IMAGES,
  addReferenceImages,
  type AddReferenceImagesResult,
  type ReferenceImageItem,
} from "./core/referenceImages";
import { revokeBlobUrl } from "./core/blobUrl";
import {
  IMAGE_SIZE_PRESETS,
  getImageSizePresetCategory,
  getImageSizePresetValue,
  isCompressionFormat,
  parseImageSize,
  validateImageSize,
} from "./core/imageOptions";
import { getTranslations, resolveLanguage, type UiLanguage } from "./i18n/translations";
import { getRuntimeAdapter } from "./runtime";
import type { OutputDirectoryState, RuntimeAdapter, RuntimeStorageCapabilities } from "./runtime/types";

const APP_VERSION = __APP_VERSION__;
const RECOMMENDED_RELAY_URL = "https://ruoli.dev/register?aff=mR35";
const GITHUB_PROJECT_URL = "https://github.com/KDB-Wind/gpt-image-2-studio";
const GITHUB_PAGES_URL = "https://kdb-wind.github.io/gpt-image-2-studio/";
const ARCHIVED_VERSION = __STATIC_VERSION_MANIFEST__.latestStable;
const ARCHIVED_VERSION_URL = `${GITHUB_PAGES_URL}versions/v${ARCHIVED_VERSION}/`;
const MINIMAL_API_EXAMPLE_URL = `${GITHUB_PROJECT_URL}#最小-api-调用示例`;
const DEFAULT_CUSTOM_SIZE = { width: "1024", height: "1024" };

type AppTab = "generate" | "batch" | "history" | "settings";
type GenerationMode = "text-to-image" | "image-to-image";
type QuickAspect = "auto" | "9:16" | "2:3" | "1:1" | "3:2" | "16:9";
type QuickResolution = "1K" | "2K" | "4K";

const QUICK_ASPECTS: QuickAspect[] = ["auto", "9:16", "2:3", "1:1", "3:2", "16:9"];
const QUICK_RESOLUTIONS: QuickResolution[] = ["1K", "2K", "4K"];
const QUICK_SIZE_BY_ASPECT: Record<Exclude<QuickAspect, "auto">, Record<QuickResolution, string>> = {
  "9:16": {
    "1K": "864x1536",
    "2K": "1152x2048",
    "4K": "2160x3840",
  },
  "2:3": {
    "1K": "1024x1536",
    "2K": "1360x2048",
    "4K": "2304x3456",
  },
  "1:1": {
    "1K": "1024x1024",
    "2K": "2048x2048",
    "4K": "2880x2880",
  },
  "3:2": {
    "1K": "1536x1024",
    "2K": "2048x1360",
    "4K": "3456x2304",
  },
  "16:9": {
    "1K": "1536x864",
    "2K": "2048x1152",
    "4K": "3840x2160",
  },
};

type SettingsMessage = {
  tone: "neutral" | "success" | "error";
  text: string;
};

type EditFromImageDraft = {
  record: ImageRecord;
  file: File;
};

type LightboxImage = {
  src: string;
  title: string;
  prompt?: string;
};

type PreviewState =
  | { status: "idle" }
  | { status: "running"; startedAt: number; prompt: string }
  | {
      status: "success";
      prompt: string;
      optimizedPrompt: string;
      imageUrl: string;
      record: ImageRecord;
      customName: string;
      source: "generated" | "history";
      saveMode?: ImageSaveMode;
      saveFallbackReason?: string;
      historyDurability?: "persistent" | "memory-only";
      historyWarning?: string;
    }
  | {
      status: "failed";
      prompt: string;
      message: string;
      durationMs: number;
    }
  | {
      status: "history-unavailable";
      record: ImageRecord;
      message: string;
    };

function GitHubMark() {
  return (
    <svg className="github-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 2C6.48 2 2 6.58 2 12.23c0 4.52 2.87 8.35 6.84 9.7.5.1.68-.22.68-.5v-1.75c-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.56 2.35 1.11 2.92.85.09-.66.35-1.11.63-1.36-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.05A9.33 9.33 0 0 1 12 6.92c.85 0 1.7.12 2.5.34 1.9-1.32 2.74-1.05 2.74-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.8-4.57 5.05.36.32.68.94.68 1.9v2.81c0 .28.18.6.69.5A10.04 10.04 0 0 0 22 12.23C22 6.58 17.52 2 12 2Z"
      />
    </svg>
  );
}

type DialogProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "regular" | "wide";
  className?: string;
};

function getErrorMessage(error: unknown): string {
  return safeErrorMessage(error);
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number, language: UiLanguage): string {
  if (bytes < 1024) {
    return new Intl.NumberFormat(language).format(bytes) + " B";
  }

  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) {
    return `${new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(kilobytes)} KB`;
  }

  const megabytes = kilobytes / 1024;
  return `${new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(megabytes)} MB`;
}

function formatDateTime(value: string, language: UiLanguage): string {
  return new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatMode(mode: RuntimeAdapter["mode"] | null, language: UiLanguage): string {
  const copy = getTranslations(language);

  if (mode === "desktop") {
    return copy.app.runtimeDesktop;
  }

  if (mode === "web") {
    return copy.app.runtimeWeb;
  }

  return copy.app.runtimeLoading;
}

function translateValidationMessages(messages: string[], language: UiLanguage): string[] {
  const copy = getTranslations(language);
  return messages.map((message) => copy.validation[message] ?? message);
}

function revokeReferenceImages(images: ReferenceImageItem[]) {
  for (const image of images) {
    revokeBlobUrl(image.previewUrl);
  }
}

function syncActiveProfile(
  config: AppConfig,
  profile: ProviderProfile,
  providerProfiles = config.providerProfiles,
): AppConfig {
  return {
    ...config,
    activeProviderProfileId: profile.id,
    providerProfiles,
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKey,
    textModel: profile.textModel,
    imageModel: profile.imageModel,
    imageResponseMode: profile.imageResponseMode,
    rememberApiKey: profile.rememberApiKey,
  };
}

function createProviderProfileId(existingIds: Set<string>): string {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const randomPart = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const id = `provider-${randomPart}`;
    if (!existingIds.has(id)) {
      return id;
    }
  }

  return `provider-${Date.now()}-${existingIds.size}`;
}

function getSinglePreviewUrl(state: PreviewState): string | undefined {
  return state.status === "success" ? state.imageUrl : undefined;
}

function getBatchPreviewUrls(preview: BatchPreviewState | null): string[] {
  return Array.from(new Set((preview?.images ?? []).map((image) => image.previewUrl)));
}

function getCustomSizeDraft(value: string) {
  const parsed = parseImageSize(value);
  return parsed
    ? {
        width: String(parsed.width),
        height: String(parsed.height),
      }
    : DEFAULT_CUSTOM_SIZE;
}

function normalizeDimensionDraft(value: string): string {
  return value.replace(/[^\d]/g, "").slice(0, 4);
}

function buildCustomSizeValue(width: string, height: string): string {
  return `${width}x${height}`;
}

function getAspectForSize(value: string): QuickAspect | "custom" {
  const normalized = value.trim();
  if (normalized === "auto") {
    return "auto";
  }

  for (const [aspect, sizes] of Object.entries(QUICK_SIZE_BY_ASPECT) as Array<
    [Exclude<QuickAspect, "auto">, Record<QuickResolution, string>]
  >) {
    if (Object.values(sizes).includes(normalized)) {
      return aspect;
    }
  }

  const parsed = parseImageSize(normalized);
  if (!parsed) {
    return "custom";
  }

  const ratio = parsed.width / parsed.height;
  const aspectRatios: Array<[Exclude<QuickAspect, "auto">, number]> = [
    ["9:16", 9 / 16],
    ["2:3", 2 / 3],
    ["1:1", 1],
    ["3:2", 3 / 2],
    ["16:9", 16 / 9],
  ];
  const closest = aspectRatios.reduce((best, current) =>
    Math.abs(current[1] - ratio) < Math.abs(best[1] - ratio) ? current : best,
  );

  return Math.abs(closest[1] - ratio) <= 0.025 ? closest[0] : "custom";
}

function getResolutionForSize(value: string): QuickResolution | "auto" | "custom" {
  const normalized = value.trim();
  if (normalized === "auto") {
    return "auto";
  }

  for (const sizes of Object.values(QUICK_SIZE_BY_ASPECT)) {
    for (const [resolution, sizeValue] of Object.entries(sizes) as Array<[QuickResolution, string]>) {
      if (sizeValue === normalized) {
        return resolution;
      }
    }
  }

  return getImageSizePresetCategory(normalized) === "custom" ? "custom" : getImageSizePresetCategory(normalized);
}

function getQuickSize(aspect: Exclude<QuickAspect, "auto">, resolution: QuickResolution): string {
  return QUICK_SIZE_BY_ASPECT[aspect][resolution];
}

function getRatioGlyphClass(aspect: QuickAspect): string {
  return `ratio-glyph ratio-${aspect.replace(":", "-")}`;
}

function clampCompression(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function Dialog({ open, title, onClose, children, footer, size = "regular", className }: DialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className={`modal-card ${size === "wide" ? "wide" : ""} ${className ?? ""}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label={title}>
            ×
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-footer">{footer}</footer> : null}
      </section>
    </div>
  );
}

export default function App() {
  const [runtime, setRuntime] = useState<RuntimeAdapter | null>(null);
  const [outputDirectoryState, setOutputDirectoryState] = useState<OutputDirectoryState | null>(null);
  const [storageCapabilities, setStorageCapabilities] = useState<RuntimeStorageCapabilities | null>(null);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [persistedConfig, setPersistedConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [history, setHistory] = useState<ImageRecord[]>([]);
  const [activeTab, setActiveTab] = useState<AppTab>("generate");
  const [generationMode, setGenerationMode] = useState<GenerationMode>("text-to-image");
  const [prompt, setPrompt] = useState("");
  const [optimizedPrompt, setOptimizedPrompt] = useState("");
  const [customName, setCustomName] = useState("");
  const [referenceImages, setReferenceImages] = useState<ReferenceImageItem[]>([]);
  const [previewState, setPreviewState] = useState<PreviewState>({ status: "idle" });
  const [batchPreviewState, setBatchPreviewState] = useState<BatchPreviewState | null>(null);
  const [batchPreviewReleaseVersion, setBatchPreviewReleaseVersion] = useState(0);
  const [historyBatchPreviewState, setHistoryBatchPreviewState] = useState<BatchPreviewState | null>(null);
  const [historyBatchPreviewTitle, setHistoryBatchPreviewTitle] = useState("");
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [expandedBatchIds, setExpandedBatchIds] = useState<Set<string>>(() => new Set());
  const [elapsedMs, setElapsedMs] = useState(0);
  const [appMessage, setAppMessage] = useState("");
  const [settingsMessage, setSettingsMessage] = useState<SettingsMessage>({ tone: "neutral", text: "" });
  const [isLoadingApp, setIsLoadingApp] = useState(true);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isTestingText, setIsTestingText] = useState(false);
  const [isTestingImage, setIsTestingImage] = useState(false);
  const [isTestingImageEdit, setIsTestingImageEdit] = useState(false);
  const [isTestingOutputDirectory, setIsTestingOutputDirectory] = useState(false);
  const [isUpdateOpen, setIsUpdateOpen] = useState(false);
  const [editFromImageDraft, setEditFromImageDraft] = useState<EditFromImageDraft | null>(null);
  const [editInstructions, setEditInstructions] = useState("");
  const [lightboxImage, setLightboxImage] = useState<LightboxImage | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [sizeMode, setSizeMode] = useState<"preset" | "custom">(
    getImageSizePresetValue(DEFAULT_CONFIG.defaultSize) === "custom" ? "custom" : "preset",
  );
  const [customWidthInput, setCustomWidthInput] = useState(DEFAULT_CUSTOM_SIZE.width);
  const [customHeightInput, setCustomHeightInput] = useState(DEFAULT_CUSTOM_SIZE.height);
  const promptRef = useRef(prompt);
  const optimizeRequestIdRef = useRef(0);
  const referenceInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);
  const referenceImagesRef = useRef<ReferenceImageItem[]>([]);
  const previewStateRef = useRef<PreviewState>({ status: "idle" });
  const batchPreviewStateRef = useRef<BatchPreviewState | null>(null);
  const historyBatchPreviewRef = useRef<BatchPreviewState | null>(null);
  const lightboxImageRef = useRef<LightboxImage | null>(null);
  const ownedPreviewUrlsRef = useRef(new Set<string>());
  const batchOwnedPreviewUrlsRef = useRef(new Set<string>());
  const revokedPreviewUrlsRef = useRef(new Set<string>());
  const isMountedRef = useRef(true);
  const outputDirectoryStateRequestRef = useRef(0);
  const providerSwitchRequestRef = useRef(0);
  const configRef = useRef<AppConfig>(DEFAULT_CONFIG);
  const setBatchPreviewStateWithCleanup = useCallback((nextPreview: BatchPreviewState | null) => {
    batchPreviewStateRef.current = nextPreview;
    for (const url of getBatchPreviewUrls(nextPreview)) {
      batchOwnedPreviewUrlsRef.current.add(url);
      ownedPreviewUrlsRef.current.delete(url);
    }
    setBatchPreviewState(nextPreview);
  }, []);
  const getReleasableBatchPreviewUrls = useCallback((urls: string[]) => {
    const releasableUrls = urls.filter((url) => !isPreviewUrlReferenced(url));
    for (const url of releasableUrls) {
      batchOwnedPreviewUrlsRef.current.delete(url);
    }
    return releasableUrls;
  }, []);

  const language = resolveLanguage(config.uiLanguage);
  const copy = getTranslations(language);
  const activeProviderProfile = useMemo(
    () => resolveActiveProviderProfile(config.providerProfiles, config.activeProviderProfileId),
    [config.activeProviderProfileId, config.providerProfiles],
  );
  useEffect(() => {
    configRef.current = config;
  }, [config]);
  const validation = useMemo(() => validateConfig(config), [config]);
  const sizeValidation = useMemo(() => validateImageSize(config.defaultSize), [config.defaultSize]);
  const translatedValidationErrors = useMemo(
    () => translateValidationMessages(validation.errors, language),
    [language, validation.errors],
  );
  const translatedValidationWarnings = useMemo(
    () => translateValidationMessages(validation.warnings, language),
    [language, validation.warnings],
  );
  const historyGroups = useMemo(() => groupHistoryByDate(history), [history]);
  const historyDisplayGroups = useMemo(
    () =>
      historyGroups.map((group) => ({
        ...group,
        items: groupHistoryRecordsForDisplay(group.records),
      })),
    [historyGroups],
  );
  const effectivePrompt = optimizedPrompt.trim() || prompt.trim();
  const canOpenOutput = runtime?.mode === "desktop";
  const isMemoryOnlyWebRuntime =
    runtime?.mode === "web" && storageCapabilities?.local === false && storageCapabilities.session === false;
  const canRememberWebApiKey = runtime?.mode === "web" && storageCapabilities?.local !== false;
  const selectedRecord = useMemo(
    () => history.find((record) => record.id === selectedHistoryId) ?? null,
    [history, selectedHistoryId],
  );
  const selectedSizeOption = sizeMode === "custom" ? "custom" : getImageSizePresetValue(config.defaultSize);
  const showCompressionControls = isCompressionFormat(config.defaultFormat);
  const showWelcome = !isLoadingApp && !config.hasDismissedWelcome;
  const isWelcomeSetupComplete =
    validation.errors.length === 0 && outputDirectoryState?.status === "ready";
  const activeBatchPreview = activeTab === "batch" ? batchPreviewState : historyBatchPreviewState;
  const isHistoryBatchPreviewActive = activeTab !== "batch" && Boolean(historyBatchPreviewState);
  const qualityLabels: Record<AppConfig["defaultQuality"], string> = {
    auto: copy.options.qualityAuto,
    low: copy.options.qualityLow,
    medium: copy.options.qualityMedium,
    high: copy.options.qualityHigh,
  };
  const aspectLabels: Record<QuickAspect, string> = {
    auto: copy.quickOptions.ratioAuto,
    "9:16": copy.quickOptions.ratioTall,
    "2:3": copy.quickOptions.ratioPortrait,
    "1:1": copy.quickOptions.ratioSquare,
    "3:2": copy.quickOptions.ratioLandscape,
    "16:9": copy.quickOptions.ratioWide,
  };
  const resolutionLabels: Record<QuickResolution | "auto" | "custom", string> = {
    auto: copy.quickOptions.resolutionAuto,
    "1K": copy.quickOptions.resolution1k,
    "2K": copy.quickOptions.resolution2k,
    "4K": copy.quickOptions.resolution4k,
    custom: copy.quickOptions.customResolution,
  };
  const formatLabels: Record<AppConfig["defaultFormat"], string> = {
    png: copy.options.formatPng,
    jpeg: copy.options.formatJpeg,
    webp: copy.options.formatWebp,
  };
  const saveModeLabels: Record<ImageSaveMode, string> = {
    "authorized-directory": copy.messages.saveModeAuthorizedDirectory,
    "browser-download": copy.messages.saveModeBrowserDownload,
  };
  const imageSizeOptions = useMemo(
    () => [
      ...IMAGE_SIZE_PRESETS.map((preset) => {
        if (preset.value === "auto") {
          return { value: preset.value, label: copy.options.sizeAuto };
        }

        const aspect = getAspectForSize(preset.value);
        const resolution = getResolutionForSize(preset.value);
        const aspectLabel = aspect === "custom" ? copy.options.sizeCustom : aspectLabels[aspect];
        const resolutionLabel = resolutionLabels[resolution];

        return {
          value: preset.value,
          label: `${resolutionLabel} ${aspectLabel} · ${preset.value}`,
        };
      }),
      { value: "custom", label: copy.options.sizeCustom },
    ],
    [aspectLabels, copy.options.sizeAuto, copy.options.sizeCustom, resolutionLabels],
  );
  const selectedAspect = getAspectForSize(config.defaultSize);
  const selectedResolution = getResolutionForSize(config.defaultSize);
  const selectedSizeLabel =
    selectedSizeOption === "custom"
      ? `${copy.options.sizeCustom}: ${config.defaultSize}`
      : imageSizeOptions.find((option) => option.value === selectedSizeOption)?.label ?? config.defaultSize;
  const selectedQualityLabel = qualityLabels[config.defaultQuality] ?? config.defaultQuality;
  const selectedAspectLabel =
    selectedAspect === "custom" ? copy.options.sizeCustom : aspectLabels[selectedAspect];
  const selectedResolutionLabel = resolutionLabels[selectedResolution];

  useEffect(() => {
    promptRef.current = prompt;
  }, [prompt]);

  useEffect(() => {
    referenceImagesRef.current = referenceImages;
  }, [referenceImages]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      outputDirectoryStateRequestRef.current += 1;
      revokeReferenceImages(referenceImagesRef.current);
      for (const url of ownedPreviewUrlsRef.current) {
        revokePreviewUrl(url);
      }
      ownedPreviewUrlsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadApp() {
      try {
        const adapter = await getRuntimeAdapter();
        const storageCapabilitiesPromise = adapter.mode === "web"
          ? adapter.getStorageCapabilities
            ? adapter.getStorageCapabilities().catch(() => ({ local: false, session: false }))
            : Promise.resolve({ local: true, session: true })
          : Promise.resolve(null);
        const [loadedConfig, loadedHistory, loadedOutputDirectoryState, loadedStorageCapabilities] = await Promise.all([
          adapter.loadConfig(),
          adapter.loadHistory(),
          adapter.getOutputDirectoryState().catch(() => null),
          storageCapabilitiesPromise,
        ]);
        const mergedConfig = mergeConfig({
          ...loadedConfig,
          rememberApiKey:
            adapter.mode === "web" && loadedStorageCapabilities?.local === false
              ? false
              : loadedConfig.rememberApiKey,
        });
        const nextLanguage = resolveLanguage(mergedConfig.uiLanguage);
        const nextCopy = getTranslations(nextLanguage);
        const customSizeDraft = getCustomSizeDraft(mergedConfig.defaultSize);

        if (!isMounted) {
          return;
        }

        setRuntime(adapter);
        setOutputDirectoryState(loadedOutputDirectoryState);
        setStorageCapabilities(loadedStorageCapabilities);
        configRef.current = mergedConfig;
        setConfig(mergedConfig);
        setPersistedConfig(mergedConfig);
        setHistory(loadedHistory);
        setSelectedHistoryId(loadedHistory[0]?.id ?? null);
        setSizeMode(getImageSizePresetValue(mergedConfig.defaultSize) === "custom" ? "custom" : "preset");
        setCustomWidthInput(customSizeDraft.width);
        setCustomHeightInput(customSizeDraft.height);
        setSettingsMessage({
          tone: "neutral",
          text: nextCopy.messages.runtimeLoaded(formatMode(adapter.mode, nextLanguage)),
        });
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const fallbackCopy = getTranslations(DEFAULT_CONFIG.uiLanguage);
        setAppMessage(fallbackCopy.messages.runtimeLoadFailed(getErrorMessage(error)));
      } finally {
        if (isMounted) {
          setIsLoadingApp(false);
        }
      }
    }

    void loadApp();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (previewState.status !== "running") {
      setElapsedMs(0);
      return;
    }

    setElapsedMs(Date.now() - previewState.startedAt);
    const intervalId = window.setInterval(() => {
      setElapsedMs(Date.now() - previewState.startedAt);
    }, 250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [previewState]);

  async function reloadHistory(adapter: RuntimeAdapter) {
    const loadedHistory = await adapter.loadHistory();
    setHistory(loadedHistory);
    return loadedHistory;
  }

  async function refreshOutputDirectoryState(adapter = runtime) {
    if (!adapter) {
      return;
    }

    const requestId = ++outputDirectoryStateRequestRef.current;

    try {
      const nextState = await adapter.getOutputDirectoryState();
      if (!isMountedRef.current || requestId !== outputDirectoryStateRequestRef.current) {
        return;
      }

      setOutputDirectoryState(nextState);
    } catch {
      if (!isMountedRef.current || requestId !== outputDirectoryStateRequestRef.current) {
        return;
      }

      setOutputDirectoryState(null);
    }
  }

  function updateConfig<K extends keyof AppConfig>(key: K, value: AppConfig[K]) {
    setConfig((current) => {
      const nextConfig = { ...current, [key]: value };
      configRef.current = nextConfig;
      return nextConfig;
    });
  }

  function updateProviderProfile<K extends keyof ProviderProfile>(key: K, value: ProviderProfile[K]) {
    setConfig((current) => {
      const activeProfile = resolveActiveProviderProfile(current.providerProfiles, current.activeProviderProfileId);
      const nextProfile = { ...activeProfile, [key]: value } as ProviderProfile;
      const nextProfiles = upsertProviderProfile(current.providerProfiles, nextProfile);
      const nextConfig = syncActiveProfile(current, nextProfile, nextProfiles);
      configRef.current = nextConfig;
      return nextConfig;
    });
  }

  function handleCreateProviderProfile() {
    if (config.providerProfiles.length >= MAX_PROVIDER_PROFILES) {
      return;
    }

    const id = createProviderProfileId(new Set(config.providerProfiles.map((profile) => profile.id)));
    const nextProfile: ProviderProfile = {
      id,
      name: `${copy.sections.providerProfiles} ${config.providerProfiles.length + 1}`,
      baseUrl: activeProviderProfile.baseUrl,
      apiKey: "",
      textModel: activeProviderProfile.textModel,
      imageModel: activeProviderProfile.imageModel,
      imageResponseMode: activeProviderProfile.imageResponseMode,
      rememberApiKey: false,
    };
    const nextProfiles = addProviderProfile(config.providerProfiles, nextProfile);
    const nextConfig = syncActiveProfile(configRef.current, nextProfile, nextProfiles);
    configRef.current = nextConfig;
    setConfig(nextConfig);
    setSettingsMessage({ tone: "neutral", text: "" });
  }

  async function handleDeleteProviderProfile() {
    const currentConfig = configRef.current;
    if (!runtime || currentConfig.providerProfiles.length <= 1) {
      return;
    }

    const deletedProfileId = currentConfig.activeProviderProfileId;
    const nextProfiles = removeProviderProfile(currentConfig.providerProfiles, deletedProfileId);
    const nextActive = nextProfiles[0];
    const nextConfig = syncActiveProfile(currentConfig, nextActive, nextProfiles);
    const nextPersistedProfiles = persistedConfig.providerProfiles.filter((profile) => profile.id !== deletedProfileId);
    const nextPersistedActive = resolveActiveProviderProfile(
      nextPersistedProfiles.length > 0 ? nextPersistedProfiles : nextProfiles,
      nextConfig.activeProviderProfileId,
    );
    const nextPersistedConfig = syncActiveProfile(
      persistedConfig,
      nextPersistedActive,
      nextPersistedProfiles.length > 0 ? nextPersistedProfiles : nextProfiles,
    );

    try {
      await runtime.saveConfig(nextPersistedConfig);
    } catch (error) {
      setSettingsMessage({
        tone: "error",
        text: copy.messages.settingsSaveFailed(getErrorMessage(error)),
      });
      return;
    }

    if (runtime.clearProviderApiKey) {
      try {
        await runtime.clearProviderApiKey(deletedProfileId);
      } catch (error) {
        try {
          await runtime.saveConfig(persistedConfig);
        } catch (rollbackError) {
          setSettingsMessage({
            tone: "error",
            text: copy.messages.settingsSaveFailed(
              `${getErrorMessage(error)}; rollback failed: ${getErrorMessage(rollbackError)}`,
            ),
          });
          return;
        }
        setSettingsMessage({
          tone: "error",
          text: copy.messages.settingsSaveFailed(getErrorMessage(error)),
        });
        return;
      }
    }

    configRef.current = nextConfig;
    setConfig(nextConfig);
    setPersistedConfig(nextPersistedConfig);
    setSettingsMessage({ tone: "neutral", text: "" });
  }

  async function persistActiveProviderProfileId(profileId: string, hydratedApiKey = "") {
    if (!runtime) {
      return;
    }

    const currentProfileIds = new Set(config.providerProfiles.map((profile) => profile.id));
    const persistedProfiles = persistedConfig.providerProfiles.filter((profile) => currentProfileIds.has(profile.id));
    const persistedProfile = persistedProfiles.find((profile) => profile.id === profileId);
    if (!persistedProfile) {
      return;
    }

    const nextProfile: ProviderProfile = {
      ...persistedProfile,
      apiKey: hydratedApiKey || persistedProfile.apiKey,
    };
    const nextConfig = syncActiveProfile(
      persistedConfig,
      nextProfile,
      persistedProfiles.map((profile) => profile.id === profileId ? nextProfile : profile),
    );

    try {
      await runtime.saveConfig(nextConfig);
      setPersistedConfig(nextConfig);
    } catch (error) {
      setSettingsMessage({
        tone: "error",
        text: copy.messages.settingsSaveFailed(getErrorMessage(error)),
      });
    }
  }

  async function handleProviderProfileChange(profileId: string) {
    const requestedId = ++providerSwitchRequestRef.current;
    const targetProfile = configRef.current.providerProfiles.find((profile) => profile.id === profileId);
    if (!targetProfile) {
      return;
    }

    let hydratedApiKey = targetProfile.apiKey;
    if (runtime?.loadProviderApiKey && !hydratedApiKey) {
      try {
        hydratedApiKey = await runtime.loadProviderApiKey(profileId);
      } catch {
        hydratedApiKey = "";
      }
    }

    if (requestedId !== providerSwitchRequestRef.current) {
      return;
    }

    const latestConfig = configRef.current;
    const currentTarget = latestConfig.providerProfiles.find((profile) => profile.id === profileId);
    if (!currentTarget) {
      return;
    }
    const nextTarget = currentTarget.apiKey ? currentTarget : { ...currentTarget, apiKey: hydratedApiKey };
    const nextConfig = syncActiveProfile(
      latestConfig,
      nextTarget,
      upsertProviderProfile(latestConfig.providerProfiles, nextTarget),
    );
    configRef.current = nextConfig;
    setConfig(nextConfig);
    await persistActiveProviderProfileId(profileId, hydratedApiKey);
  }

  function clearReferenceInput() {
    if (referenceInputRef.current) {
      referenceInputRef.current.value = "";
    }
  }

  function setReferenceImagesWithCleanup(nextImages: ReferenceImageItem[]) {
    setReferenceImages((currentImages) => {
      const nextIds = new Set(nextImages.map((item) => item.id));
      const removedImages = currentImages.filter((item) => !nextIds.has(item.id));

      if (removedImages.length > 0) {
        revokeReferenceImages(removedImages);
      }

      return nextImages;
    });
  }

  function setHistoryBatchPreviewWithCleanup(nextPreview: BatchPreviewState | null, title = "") {
    if (!isMountedRef.current) {
      for (const url of getBatchPreviewUrls(nextPreview)) {
        revokePreviewUrl(url);
      }
      return;
    }

    const currentPreview = historyBatchPreviewRef.current;
    historyBatchPreviewRef.current = nextPreview;
    for (const url of getBatchPreviewUrls(nextPreview)) {
      adoptPreviewUrl(url);
    }
    setHistoryBatchPreviewState(nextPreview);
    setHistoryBatchPreviewTitle(title);
    setBatchPreviewReleaseVersion((currentVersion) => currentVersion + 1);
    for (const url of getBatchPreviewUrls(currentPreview)) {
      releaseOwnedPreviewUrl(url);
    }
  }

  function setPreviewStateWithCleanup(nextState: PreviewState) {
    if (!isMountedRef.current) {
      revokePreviewUrl(getSinglePreviewUrl(nextState));
      return;
    }

    const currentState = previewStateRef.current;
    previewStateRef.current = nextState;
    const nextUrl = getSinglePreviewUrl(nextState);
    adoptPreviewUrl(nextUrl);
    setPreviewState(nextState);
    setBatchPreviewReleaseVersion((currentVersion) => currentVersion + 1);
    releaseOwnedPreviewUrl(getSinglePreviewUrl(currentState));
  }

  function setLightboxImageWithCleanup(nextImage: LightboxImage | null) {
    const currentImage = lightboxImageRef.current;
    lightboxImageRef.current = nextImage;
    setLightboxImage(nextImage);
    setBatchPreviewReleaseVersion((currentVersion) => currentVersion + 1);
    releaseOwnedPreviewUrl(currentImage?.src);
  }

  function releaseOwnedPreviewUrl(url?: string) {
    if (!url || !ownedPreviewUrlsRef.current.has(url) || isPreviewUrlReferenced(url)) {
      return;
    }

    ownedPreviewUrlsRef.current.delete(url);
    revokePreviewUrl(url);
  }

  function adoptPreviewUrl(url?: string) {
    if (url && !batchOwnedPreviewUrlsRef.current.has(url)) {
      ownedPreviewUrlsRef.current.add(url);
    }
  }

  function revokePreviewUrl(url?: string) {
    if (!url || batchOwnedPreviewUrlsRef.current.has(url) || revokedPreviewUrlsRef.current.has(url)) {
      return;
    }

    revokedPreviewUrlsRef.current.add(url);
    ownedPreviewUrlsRef.current.delete(url);
    revokeBlobUrl(url);
  }

  function isPreviewUrlReferenced(url: string): boolean {
    return (
      getSinglePreviewUrl(previewStateRef.current) === url ||
      getBatchPreviewUrls(batchPreviewStateRef.current).includes(url) ||
      getBatchPreviewUrls(historyBatchPreviewRef.current).includes(url) ||
      lightboxImageRef.current?.src === url
    );
  }

  function buildReferenceImagesMessage(result: AddReferenceImagesResult): string {
    const parts: string[] = [];

    if (result.addedCount > 0) {
      parts.push(copy.messages.referenceImagesAdded(result.addedCount, result.images.length));
    }

    if (result.invalidCount > 0) {
      parts.push(copy.messages.referenceImagesInvalidSkipped(result.invalidCount));
    }

    if (result.overflowCount > 0) {
      parts.push(copy.messages.referenceImagesOverflowSkipped(result.overflowCount, MAX_REFERENCE_IMAGES));
    }

    return parts.join(" ").trim();
  }

  function addReferenceFiles(files: File[]) {
    if (files.length === 0) {
      return;
    }

    const result = addReferenceImages(referenceImages, files);
    setReferenceImagesWithCleanup(result.images);
    setGenerationMode("image-to-image");

    const message = buildReferenceImagesMessage(result);
    if (message) {
      setAppMessage(message);
    }
  }

  async function persistUiPreferences(
    patch: Pick<Partial<AppConfig>, "uiLanguage" | "hasDismissedWelcome">,
    nextLanguage = resolveLanguage(patch.uiLanguage ?? config.uiLanguage),
  ) {
    if (!runtime) {
      return;
    }

    const nextPersistedConfig = mergeConfig({
      ...persistedConfig,
      ...patch,
    });

    try {
      await runtime.saveConfig(nextPersistedConfig);
      setPersistedConfig(nextPersistedConfig);
    } catch (error) {
      const nextCopy = getTranslations(nextLanguage);
      setAppMessage(nextCopy.messages.settingsSaveFailed(getErrorMessage(error)));
    }
  }

  function requireValidConfig(actionLabel: string): boolean {
    const nextValidation = validateConfig(configRef.current);
    const translatedErrors = translateValidationMessages(nextValidation.errors, language);

    if (translatedErrors.length === 0) {
      return true;
    }

    const message = copy.messages.actionNeedsValidSettings(actionLabel, translatedErrors.join(" "));
    setActiveTab("settings");
    setAppMessage(message);
    setSettingsMessage({
      tone: "error",
      text: message,
    });
    return false;
  }

  function handlePromptChange(nextPrompt: string) {
    setPrompt(nextPrompt);

    if (optimizedPrompt) {
      setOptimizedPrompt("");
      setAppMessage(copy.messages.promptChangedCleared);
    }
  }

  function handleGenerationModeChange(nextMode: GenerationMode) {
    setGenerationMode(nextMode);
  }

  function handleSizePresetChange(nextValue: string) {
    if (nextValue === "custom") {
      const nextDraft = getCustomSizeDraft(
        getImageSizePresetValue(config.defaultSize) === "custom" ? config.defaultSize : "1024x1024",
      );
      setSizeMode("custom");
      setCustomWidthInput(nextDraft.width);
      setCustomHeightInput(nextDraft.height);
      updateConfig("defaultSize", buildCustomSizeValue(nextDraft.width, nextDraft.height));
      return;
    }

    setSizeMode("preset");
    updateConfig("defaultSize", nextValue);
  }

  function handleCustomWidthChange(nextValue: string) {
    const normalized = normalizeDimensionDraft(nextValue);
    setCustomWidthInput(normalized);
    updateConfig("defaultSize", buildCustomSizeValue(normalized, customHeightInput));
  }

  function handleCustomHeightChange(nextValue: string) {
    const normalized = normalizeDimensionDraft(nextValue);
    setCustomHeightInput(normalized);
    updateConfig("defaultSize", buildCustomSizeValue(customWidthInput, normalized));
  }

  function handleQualityChange(nextValue: AppConfig["defaultQuality"]) {
    updateConfig("defaultQuality", nextValue);
  }

  function handleQuickAspectChange(nextAspect: QuickAspect) {
    if (nextAspect === "auto") {
      setSizeMode("preset");
      updateConfig("defaultSize", "auto");
      return;
    }

    const nextResolution = selectedResolution === "auto" || selectedResolution === "custom" ? "1K" : selectedResolution;
    setSizeMode("preset");
    updateConfig("defaultSize", getQuickSize(nextAspect, nextResolution));
  }

  function handleQuickResolutionChange(nextResolution: QuickResolution) {
    const nextAspect = selectedAspect === "auto" || selectedAspect === "custom" ? "1:1" : selectedAspect;
    setSizeMode("preset");
    updateConfig("defaultSize", getQuickSize(nextAspect, nextResolution));
  }

  function handleFormatChange(nextValue: AppConfig["defaultFormat"]) {
    updateConfig("defaultFormat", nextValue);
  }

  function renderQuickOutputOptions(disabled = false) {
    const controlsDisabled = disabled || isLoadingApp || isGenerating;

    return (
      <details className="quick-output-options">
        <summary>
          <span>{copy.quickOptions.title}</span>
          <strong>
            {selectedAspectLabel} · {selectedResolutionLabel} · {selectedQualityLabel}
          </strong>
        </summary>
        <div className="quick-output-options-body">
          <section className="quick-option-section" aria-label={copy.quickOptions.aspect}>
            <div className="quick-option-section-title">{copy.quickOptions.aspect}</div>
            <div className="quick-option-group ratio-option-group">
              {QUICK_ASPECTS.map((aspect) => (
                <button
                  key={aspect}
                  type="button"
                  className={`quick-option-chip ${selectedAspect === aspect ? "active" : ""}`}
                  disabled={controlsDisabled}
                  onClick={() => handleQuickAspectChange(aspect)}
                  aria-pressed={selectedAspect === aspect}
                >
                  <span className={getRatioGlyphClass(aspect)} aria-hidden="true" />
                  <span>{aspectLabels[aspect]}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="quick-option-section" aria-label={copy.quickOptions.resolution}>
            <div className="quick-option-section-title">{copy.quickOptions.resolution}</div>
            <div className="quick-option-group">
              {QUICK_RESOLUTIONS.map((resolution) => (
                <button
                  key={resolution}
                  type="button"
                  className={`quick-option-chip ${selectedResolution === resolution ? "active" : ""}`}
                  disabled={controlsDisabled}
                  onClick={() => handleQuickResolutionChange(resolution)}
                  aria-pressed={selectedResolution === resolution}
                >
                  {resolutionLabels[resolution]}
                </button>
              ))}
            </div>
          </section>

          <section className="quick-option-section" aria-label={copy.quickOptions.quality}>
            <div className="quick-option-section-title">{copy.quickOptions.quality}</div>
            <div className="quick-option-group">
              {(["auto", "low", "medium", "high"] as AppConfig["defaultQuality"][]).map((quality) => (
                <button
                  key={quality}
                  type="button"
                  className={`quick-option-chip ${config.defaultQuality === quality ? "active" : ""}`}
                  disabled={controlsDisabled}
                  onClick={() => handleQualityChange(quality)}
                  aria-pressed={config.defaultQuality === quality}
                >
                  {qualityLabels[quality]}
                </button>
              ))}
            </div>
          </section>

          <details className="help-details quick-output-options-note">
            <summary>{copy.help.imageOptions}</summary>
            <div className="help-details-body">
              <p>
                {copy.quickOptions.hint} {copy.quickOptions.providerHint}
              </p>
            </div>
          </details>
          {selectedSizeOption === "custom" ? (
            <p className="panel-note highlight-note">
              {copy.options.sizeCustom}: {selectedSizeLabel}
            </p>
          ) : null}
          {sizeValidation.warning ? (
            <p className="panel-note highlight-note">
              {copy.validation[sizeValidation.warning] ?? sizeValidation.warning}
            </p>
          ) : null}
        </div>
      </details>
    );
  }

  function handleCompressionChange(nextValue: string) {
    if (!nextValue.trim()) {
      updateConfig("defaultCompression", 0);
      return;
    }

    updateConfig("defaultCompression", clampCompression(Number(nextValue) || 0));
  }

  function handleReferenceImageChange(event: ChangeEvent<HTMLInputElement>) {
    addReferenceFiles(Array.from(event.target.files ?? []));
    clearReferenceInput();
  }

  function handleRemoveReferenceImage(id: string) {
    const removedImage = referenceImages.find((image) => image.id === id);
    if (!removedImage) {
      return;
    }

    setReferenceImagesWithCleanup(referenceImages.filter((image) => image.id !== id));
    setAppMessage(copy.messages.referenceImageRemoved(removedImage.file.name));
  }

  function handleClearReferenceImages() {
    if (referenceImages.length === 0) {
      return;
    }

    setReferenceImagesWithCleanup([]);
    clearReferenceInput();
    setAppMessage(copy.messages.referenceImagesCleared);
  }

  function hasDraggedFiles(event: DragEvent<HTMLElement>) {
    return Array.from(event.dataTransfer.types).includes("Files");
  }

  function handleReferenceDragEnter(event: DragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event)) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDragOver(true);
  }

  function handleReferenceDragOver(event: DragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  }

  function handleReferenceDragLeave(event: DragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event)) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);

    if (dragDepthRef.current === 0) {
      setIsDragOver(false);
    }
  }

  function handleReferenceDrop(event: DragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event)) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDragOver(false);
    addReferenceFiles(Array.from(event.dataTransfer.files));
  }

  async function handleLanguageChange(nextLanguage: UiLanguage) {
    if (nextLanguage === language) {
      return;
    }

    const nextCopy = getTranslations(nextLanguage);
    updateConfig("uiLanguage", nextLanguage);
    setAppMessage("");
    setSettingsMessage({
      tone: "neutral",
      text: runtime ? nextCopy.messages.runtimeLoaded(formatMode(runtime.mode, nextLanguage)) : "",
    });
    await persistUiPreferences({ uiLanguage: nextLanguage }, nextLanguage);
  }

  async function handleDismissWelcome() {
    if (config.hasDismissedWelcome) {
      return;
    }

    updateConfig("hasDismissedWelcome", true);
    await persistUiPreferences({ hasDismissedWelcome: true });
  }

  async function handleWelcomePrimaryAction() {
    await handleDismissWelcome();
    setActiveTab(isWelcomeSetupComplete ? "generate" : "settings");
  }

  async function handleOpenRecommendedRelay() {
    try {
      if (runtime?.mode === "desktop") {
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl(RECOMMENDED_RELAY_URL);
        return;
      }

      window.open(RECOMMENDED_RELAY_URL, "_blank", "noopener,noreferrer");
    } catch (error) {
      setAppMessage(getErrorMessage(error));
    }
  }

  async function handleOptimizePrompt() {
    const nextPrompt = prompt.trim();

    if (!nextPrompt) {
      setAppMessage(copy.messages.promptRequiredForOptimize);
      return;
    }

    if (!requireValidConfig(copy.actions.optimize)) {
      return;
    }

    setIsOptimizing(true);
    setAppMessage("");
    const requestId = optimizeRequestIdRef.current + 1;
    optimizeRequestIdRef.current = requestId;

    try {
      const revisedPrompt = await optimizePrompt(configRef.current, nextPrompt);

      if (optimizeRequestIdRef.current !== requestId) {
        return;
      }

      if (promptRef.current.trim() !== nextPrompt) {
        setAppMessage(copy.messages.optimizationDiscarded);
        return;
      }

      setOptimizedPrompt(revisedPrompt.trim());
    } catch (error) {
      if (optimizeRequestIdRef.current !== requestId) {
        return;
      }

      if (promptRef.current.trim() !== nextPrompt) {
        return;
      }

      setAppMessage(copy.messages.optimizationFailed(getErrorMessage(error)));
    } finally {
      if (optimizeRequestIdRef.current === requestId) {
        setIsOptimizing(false);
      }
    }
  }

  async function handleGenerate() {
    if (!runtime) {
      return;
    }

    const sourcePrompt = prompt.trim();
    const finalPrompt = optimizedPrompt.trim() || sourcePrompt;

    if (!sourcePrompt) {
      setAppMessage(copy.messages.promptRequiredForGenerate);
      return;
    }

    if (generationMode === "image-to-image" && referenceImages.length === 0) {
      setAppMessage(copy.messages.referenceImageRequired);
      return;
    }

    if (!requireValidConfig(copy.actions.generate)) {
      setPreviewStateWithCleanup({
        status: "failed",
        prompt: finalPrompt,
        message: translatedValidationErrors.join(" "),
        durationMs: 0,
      });
      return;
    }

    setIsGenerating(true);
    setAppMessage("");
    const startedAt = Date.now();
    setPreviewStateWithCleanup({ status: "running", startedAt, prompt: finalPrompt });
    let savedPreviewUrl: string | undefined;

    try {
      const requestConfig = configRef.current;
      const generatedImages = await generateImages(
        requestConfig,
        finalPrompt,
        generationMode === "image-to-image" && referenceImages.length > 0
          ? { referenceImages: referenceImages.map((item) => item.file) }
          : undefined,
      );
      if (!isMountedRef.current) {
        return;
      }
      const [singleImage] = generatedImages;

      if (!singleImage) {
        throw new Error(copy.messages.generationNoImages);
      }

      const generatedAt = new Date();
      const durationMs = Date.now() - startedAt;
      const savedResult = await runtime.saveImage({
        image: singleImage,
        prompt: sourcePrompt,
        optimizedPrompt: optimizedPrompt.trim(),
        customName: customName.trim(),
        config: requestConfig,
        generatedAt,
        durationMs,
        providerProfileSnapshot: createProviderProfileSnapshot(requestConfig),
      });

      savedPreviewUrl = savedResult.previewUrl;
      if (!isMountedRef.current) {
        revokePreviewUrl(savedPreviewUrl);
        return;
      }
      adoptPreviewUrl(savedPreviewUrl);
      await reloadHistory(runtime);
      if (!isMountedRef.current) {
        return;
      }
      setSelectedHistoryId(savedResult.record.id);
      setPreviewStateWithCleanup({
        status: "success",
        prompt: sourcePrompt,
        optimizedPrompt: optimizedPrompt.trim(),
        imageUrl: savedResult.previewUrl,
        record: savedResult.record,
        customName: customName.trim(),
        source: "generated",
        saveMode: savedResult.saveMode,
        saveFallbackReason: savedResult.saveFallbackReason,
        historyDurability: savedResult.historyDurability,
        historyWarning: savedResult.historyWarning,
      });
    } catch (error) {
      if (!isMountedRef.current) {
        revokePreviewUrl(savedPreviewUrl);
        return;
      }
      setPreviewStateWithCleanup({
        status: "failed",
        prompt: finalPrompt,
        message: getErrorMessage(error),
        durationMs: Date.now() - startedAt,
      });
      releaseOwnedPreviewUrl(savedPreviewUrl);
    } finally {
      if (isMountedRef.current) {
        setIsGenerating(false);
      }
    }
  }

  async function handleSaveSettings() {
    if (!runtime) {
      return;
    }

    if (!activeProviderProfile.name.trim()) {
      setSettingsMessage({
        tone: "error",
        text: copy.messages.providerProfileNameRequired,
      });
      return;
    }

    setIsSavingSettings(true);

    try {
      const nextProfile = { ...activeProviderProfile, name: activeProviderProfile.name.trim() };
      const nextConfig = syncActiveProfile(
        config,
        nextProfile,
        upsertProviderProfile(config.providerProfiles, nextProfile),
      );
      configRef.current = nextConfig;
      setConfig(nextConfig);
      await runtime.saveConfig(nextConfig);
      setPersistedConfig(nextConfig);
      const details = [...translatedValidationErrors, ...translatedValidationWarnings].join(" ");
      const hasErrors = translatedValidationErrors.length > 0;

      setSettingsMessage({
        tone: hasErrors ? "error" : "success",
        text: details ? copy.messages.settingsSavedWithIssues(details) : copy.messages.settingsSaved,
      });
    } catch (error) {
      setSettingsMessage({
        tone: "error",
        text: copy.messages.settingsSaveFailed(getErrorMessage(error)),
      });
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function handleChooseDirectory() {
    if (!runtime) {
      return;
    }

    try {
      const selectedDirectory = await runtime.chooseOutputDirectory();

      if (selectedDirectory) {
        const nextConfig = { ...config, outputDirectory: selectedDirectory };
        configRef.current = nextConfig;
        setConfig(nextConfig);
        await runtime.saveConfig(nextConfig);
        setPersistedConfig(nextConfig);
        await refreshOutputDirectoryState(runtime);
        setSettingsMessage({
          tone: "success",
          text: copy.messages.outputSelected(selectedDirectory),
        });
      } else {
        setSettingsMessage({
          tone: "error",
          text:
            runtime.mode === "web"
              ? copy.messages.chooseDirectoryUnavailableWeb
              : copy.messages.chooseDirectoryCancelled,
        });
      }
    } catch (error) {
      setSettingsMessage({
        tone: "error",
        text: copy.messages.chooseDirectoryFailed(getErrorMessage(error)),
      });
    }
  }

  async function handleTestTextModel() {
    if (!requireValidConfig(copy.actions.testText)) {
      return;
    }

    setIsTestingText(true);

    try {
      const response = await testTextModel(configRef.current);
      setSettingsMessage({
        tone: "success",
        text: copy.messages.textTestSuccess(response.trim().slice(0, 120) || "OK"),
      });
    } catch (error) {
      setSettingsMessage({
        tone: "error",
        text: copy.messages.textTestFailed(getErrorMessage(error)),
      });
    } finally {
      setIsTestingText(false);
    }
  }

  async function handleTestImageModel() {
    if (!requireValidConfig(copy.actions.testImage)) {
      return;
    }

    setIsTestingImage(true);

    try {
      const images = await testImageModel(configRef.current);
      setSettingsMessage({
        tone: "success",
        text: copy.messages.imageTestSuccess(images.length),
      });
    } catch (error) {
      setSettingsMessage({
        tone: "error",
        text: copy.messages.imageTestFailed(getErrorMessage(error)),
      });
    } finally {
      setIsTestingImage(false);
    }
  }

  async function handleTestImageEdit() {
    if (!requireValidConfig(copy.actions.testImageEdit)) {
      return;
    }

    setIsTestingImageEdit(true);

    try {
      const images = await testImageEditModel(configRef.current);
      setSettingsMessage({
        tone: "success",
        text: copy.messages.imageEditTestSuccess(images.length),
      });
    } catch (error) {
      setSettingsMessage({
        tone: "error",
        text: copy.messages.imageEditTestFailed(getErrorMessage(error)),
      });
    } finally {
      setIsTestingImageEdit(false);
    }
  }

  function handleReusePrompt(record: ImageRecord) {
    setPrompt(record.prompt);
    setOptimizedPrompt(record.optimizedPrompt);
    setCustomName("");
    setGenerationMode("text-to-image");
    setReferenceImagesWithCleanup([]);
    clearReferenceInput();
    setSelectedHistoryId(record.id);
    setHistoryBatchPreviewWithCleanup(null);
    setActiveTab("generate");
  }

  async function handleOpenOutput(record: ImageRecord) {
    if (!runtime) {
      return;
    }

    try {
      await runtime.openOutputPath(record.outputPath);
    } catch (error) {
      setAppMessage(copy.messages.openOutputFailed(getErrorMessage(error)));
    }
  }

  async function handleInspectHistory(record: ImageRecord) {
    setSelectedHistoryId(record.id);
    setHistoryBatchPreviewWithCleanup(null);
    setActiveTab("history");

    if (!runtime) {
      return;
    }

    try {
      const imageUrl = await runtime.prepareHistoryPreview(record);

      if (!isMountedRef.current) {
        revokePreviewUrl(imageUrl ?? undefined);
        return;
      }

      if (imageUrl) {
        setPreviewStateWithCleanup({
          status: "success",
          prompt: record.prompt,
          optimizedPrompt: record.optimizedPrompt,
          imageUrl,
          record,
          customName: "",
          source: "history",
        });
        return;
      }

      setPreviewStateWithCleanup({
        status: "history-unavailable",
        record,
        message: copy.messages.historyPreviewFileMissing,
      });
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }
      setPreviewStateWithCleanup({
        status: "history-unavailable",
        record,
        message: copy.messages.historyPreviewPreparationFailed(getErrorMessage(error)),
      });
    }
  }

  async function handleTestOutputDirectory() {
    if (!runtime) {
      return;
    }

    setIsTestingOutputDirectory(true);

    try {
      const result = await runtime.testOutputDirectory();

      setSettingsMessage({
        tone: result.ok ? "success" : "error",
        text:
          result.ok && result.fileName && result.bytes
            ? copy.messages.outputDirectoryTestSuccess(result.fileName, result.bytes)
            : copy.messages.outputDirectoryTestFailed(result.message),
      });
    } catch (error) {
      setSettingsMessage({
        tone: "error",
        text: copy.messages.outputDirectoryTestFailed(getErrorMessage(error)),
      });
    } finally {
      await refreshOutputDirectoryState(runtime);
      setIsTestingOutputDirectory(false);
    }
  }

  function toggleHistoryBatch(batchId: string) {
    setExpandedBatchIds((current) => {
      const next = new Set(current);
      if (next.has(batchId)) {
        next.delete(batchId);
      } else {
        next.add(batchId);
      }
      return next;
    });
  }

  async function handleInspectHistoryBatch(item: Extract<HistoryDisplayItem, { type: "batch" }>) {
    setSelectedHistoryId(item.records[0]?.id ?? null);
    setActiveTab("history");

    if (!runtime) {
      return;
    }

    const restoredImages: BatchPreviewImage[] = [];

    try {
      for (const [index, record] of item.records.entries()) {
        const previewUrl = await runtime.prepareHistoryPreview(record);

        if (!isMountedRef.current) {
          revokeBatchPreviewUrls([...restoredImages, ...(previewUrl ? [{ previewUrl }] : [])]);
          return;
        }

        if (!previewUrl) {
          continue;
        }

        restoredImages.push({
          id: record.id,
          index: record.batch?.taskIndex ?? index,
          title: record.batch?.taskTitle ?? record.outputPath.split(/[\\/]/).pop() ?? record.prompt,
          prompt: record.optimizedPrompt || record.prompt,
          previewUrl,
          outputPath: record.outputPath,
          durationMs: record.durationMs,
          completedAt: record.createdAt,
        });
        adoptPreviewUrl(previewUrl);
      }
    } catch {
      releaseBatchPreviewUrls(restoredImages);
      if (isMountedRef.current) {
        setHistoryBatchPreviewWithCleanup(null);
      }
      return;
    }

    if (restoredImages.length === 0) {
      setHistoryBatchPreviewWithCleanup(null);
      const fallbackRecord = item.records[0];
      if (fallbackRecord) {
        setPreviewStateWithCleanup({
          status: "history-unavailable",
          record: fallbackRecord,
          message: copy.messages.historyPreviewFileMissing,
        });
      }
      return;
    }

    const latestImage = restoredImages.reduce<BatchPreviewImage | null>((latest, image) => {
      if (!latest) {
        return image;
      }

      return Date.parse(image.completedAt) >= Date.parse(latest.completedAt) ? image : latest;
    }, null);
    const succeeded = item.records.filter((record) => record.status === "success").length;
    const failed = item.records.filter((record) => record.status === "failed").length;
    const skipped = item.records.filter((record) => record.status === "cancelled").length;
    const total = item.totalTasks ?? item.records.length;

    setHistoryBatchPreviewWithCleanup(
      {
        status: "completed",
        summary: {
          total,
          pending: Math.max(0, total - succeeded - failed - skipped),
          running: 0,
          succeeded,
          failed,
          skipped,
          memoryOnlyHistory: 0,
          durationMs: item.records.reduce((sum, record) => sum + record.durationMs, 0),
        },
        latestImage,
        images: restoredImages,
        runningTask: null,
      },
      item.title,
    );
  }

  function revokeBatchPreviewUrls(images: Array<Pick<BatchPreviewImage, "previewUrl">>) {
    for (const url of new Set(images.map((image) => image.previewUrl))) {
      revokePreviewUrl(url);
    }
  }

  function releaseBatchPreviewUrls(images: Array<Pick<BatchPreviewImage, "previewUrl">>) {
    for (const url of new Set(images.map((image) => image.previewUrl))) {
      releaseOwnedPreviewUrl(url);
    }
  }

  async function fileFromPreviewUrl(previewUrl: string, fallbackName: string): Promise<File | null> {
    try {
      const response = await fetch(previewUrl);
      if (!response.ok) {
        return null;
      }

      const blob = await response.blob();
      return new File([blob], fallbackName, { type: blob.type || "image/png" });
    } catch {
      return null;
    }
  }

  async function handleStartEditFromImage(record: ImageRecord, previewUrl?: string) {
    const fallbackFileName = record.outputPath.split(/[\\/]/).pop() || "history-image.png";
    const file = previewUrl
      ? await fileFromPreviewUrl(previewUrl, fallbackFileName)
      : runtime
        ? await runtime.prepareHistoryFile(record)
        : null;

    if (!file) {
      setAppMessage(copy.messages.editFromImageUnavailable);
      return;
    }

    setEditFromImageDraft({ record, file });
    setEditInstructions("");
  }

  function handleConfirmEditFromImage() {
    if (!editFromImageDraft) {
      return;
    }

    const result = addReferenceImages([], [editFromImageDraft.file]);

    if (result.addedCount === 0) {
      setAppMessage(copy.messages.editFromImageUnavailable);
      setEditFromImageDraft(null);
      return;
    }

    const basePrompt = editFromImageDraft.record.optimizedPrompt || editFromImageDraft.record.prompt;
    const instructions = editInstructions.trim();
    setReferenceImagesWithCleanup(result.images);
    setGenerationMode("image-to-image");
    setPrompt(instructions ? `${basePrompt}\n\n${copy.fields.editInstructions}: ${instructions}` : basePrompt);
    setOptimizedPrompt("");
    setCustomName("");
    setSelectedHistoryId(editFromImageDraft.record.id);
    setHistoryBatchPreviewWithCleanup(null);
    setActiveTab("generate");
    setEditFromImageDraft(null);
    setEditInstructions("");
    clearReferenceInput();
    setAppMessage(copy.messages.editFromImageReady);
  }

  function handlePreviewImageError(successState: Extract<PreviewState, { status: "success" }>) {
    if (successState.source === "history") {
      setPreviewStateWithCleanup({
        status: "history-unavailable",
        record: successState.record,
        message: copy.messages.historyPreviewUnavailable,
      });
      return;
    }

    setPreviewStateWithCleanup({
      status: "failed",
      prompt: successState.prompt,
      message: copy.messages.generatedPreviewLoadFailed,
      durationMs: successState.record.durationMs,
    });
  }

  const modeLabel = generationMode === "image-to-image" ? copy.modes.imageToImage : copy.modes.textToImage;
  const outputDirectoryLabel = config.outputDirectory || "outputs";
  const outputDirectoryStateMessage = outputDirectoryState
    ? outputDirectoryState.status === "unsupported"
      ? copy.notes.outputDirectoryStateUnsupported
      : outputDirectoryState.status === "not-authorized"
        ? copy.notes.outputDirectoryStateNotAuthorized
        : outputDirectoryState.status === "permission-required"
          ? copy.notes.outputDirectoryStatePermissionRequired(outputDirectoryState.name)
          : copy.notes.outputDirectoryStateReady(outputDirectoryState.name, outputDirectoryState.lastTestedAt)
    : copy.notes.outputDirectoryStatusBody(outputDirectoryLabel, copy.actions.testOutputDirectory);

  return (
    <>
      <main className={`app-shell tab-${activeTab} ${activeTab === "history" ? "history-focus" : ""}`}>
        <header className="app-header">
          <div className="hero-copy">
            <div className="brand-lockup">
              <AppLogo className="app-logo" />
              <div className="brand-text">
                <p className="eyebrow">{copy.app.eyebrow}</p>
                <h1>{copy.app.title}</h1>
              </div>
            </div>
            <p className="app-subtitle">{copy.app.subtitle}</p>
          </div>

          <div className="header-stack">
            <div className="language-card">
              <span>{copy.app.languageLabel}</span>
              <div className="language-switch" role="tablist" aria-label={copy.app.languageLabel}>
                {([
                  ["zh-CN", "简体中文"],
                  ["en-US", "English"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={language === value}
                    className={language === value ? "active" : ""}
                    onClick={() => void handleLanguageChange(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mode-chip" aria-live="polite">
              <span className={`mode-dot ${runtime?.mode ?? "loading"}`} />
              <div>
                <strong>{copy.app.environment}</strong>
                <span>{formatMode(runtime?.mode ?? null, language)}</span>
              </div>
            </div>

            <a
              className="github-link"
              href={GITHUB_PROJECT_URL}
              target="_blank"
              rel="noreferrer"
              aria-label={copy.actions.openGithubProject}
            >
              <GitHubMark />
              <span>GitHub</span>
            </a>
          </div>
        </header>

        {appMessage ? (
          <div className="app-banner" role="status">
            {appMessage}
          </div>
        ) : null}

        <div className="tab-strip" role="tablist" aria-label="Workspace tabs">
          {([
            ["generate", copy.tabs.generate],
            ["batch", copy.tabs.batch],
            ["history", copy.tabs.history],
            ["settings", copy.tabs.settings],
          ] as const).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              className={`tab-button ${activeTab === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {label}
            </button>
          ))}
        </div>

        <section className="workspace-grid">
          <section className="panel control-panel">
            <header className="panel-header">
              <div>
                <h2>
                  {activeTab === "generate" && copy.panel.generateTitle}
                  {activeTab === "batch" && copy.batch.title}
                  {activeTab === "history" && copy.panel.historyToolsTitle}
                  {activeTab === "settings" && copy.panel.settingsTitle}
                </h2>
                <p>
                  {activeTab === "generate" && copy.panel.generateDescription}
                  {activeTab === "batch" && copy.batch.description}
                  {activeTab === "history" && copy.panel.historyToolsDescription}
                  {activeTab === "settings" && copy.panel.settingsDescription}
                </p>
              </div>
            </header>

            {activeTab === "generate" ? (
              <div className="panel-body form-stack">
                <ProviderProfileSelector
                  profiles={config.providerProfiles}
                  activeProfileId={config.activeProviderProfileId}
                  language={language}
                  testId="single-provider-profile"
                  disabled={isGenerating || isOptimizing || isLoadingApp}
                  onChange={handleProviderProfileChange}
                />
                <div className="mode-toggle" role="tablist" aria-label={copy.labels.mode}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={generationMode === "text-to-image"}
                    className={generationMode === "text-to-image" ? "active" : ""}
                    onClick={() => handleGenerationModeChange("text-to-image")}
                  >
                    {copy.modes.textToImage}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={generationMode === "image-to-image"}
                    className={generationMode === "image-to-image" ? "active" : ""}
                    onClick={() => handleGenerationModeChange("image-to-image")}
                  >
                    {copy.modes.imageToImage}
                  </button>
                </div>

                {renderQuickOutputOptions()}

                {generationMode === "image-to-image" ? (
                  <section className="reference-section">
                    <div className="section-heading">
                      <h3>{copy.fields.referenceImage}</h3>
                      <details className="help-details reference-help-details">
                        <summary>{copy.help.referenceImages}</summary>
                        <div className="help-details-body">
                          <p>{copy.notes.imageToImageModeDescription}</p>
                          <p>{copy.notes.referenceImageLimitHint}</p>
                          <p>{copy.notes.referenceImageHint}</p>
                        </div>
                      </details>
                    </div>

                    <input
                      ref={referenceInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      data-testid="single-reference-input"
                      className="hidden-file-input"
                      onChange={handleReferenceImageChange}
                    />

                    <div
                      className={`reference-dropzone ${isDragOver ? "drag-over" : ""}`}
                      onDragEnter={handleReferenceDragEnter}
                      onDragOver={handleReferenceDragOver}
                      onDragLeave={handleReferenceDragLeave}
                      onDrop={handleReferenceDrop}
                    >
                      <div className="reference-dropzone-copy">
                        <strong>{copy.fields.referenceImagePlaceholder}</strong>
                        <p>{copy.notes.dragAndDropHint}</p>
                      </div>
                      <div className="action-row">
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => referenceInputRef.current?.click()}
                        >
                          {referenceImages.length > 0 ? copy.actions.changeImage : copy.actions.chooseImage}
                        </button>
                        {referenceImages.length > 0 ? (
                          <button type="button" className="secondary-button" onClick={handleClearReferenceImages}>
                            {copy.actions.clearImages}
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="reference-summary">
                      <span>
                        {copy.cards.referenceImages}: {referenceImages.length}/{MAX_REFERENCE_IMAGES}
                      </span>
                    </div>

                    {referenceImages.length > 0 ? (
                      <div className="reference-grid">
                        {referenceImages.map((image) => (
                          <article key={image.id} className="reference-card">
                            <div className="reference-preview">
                              <img src={image.previewUrl} alt={image.file.name} />
                            </div>
                            <div className="reference-details">
                              <strong title={image.file.name}>{image.file.name}</strong>
                              <span>{formatFileSize(image.file.size, language)}</span>
                            </div>
                            <button
                              type="button"
                              className="ghost-button reference-remove-button"
                              onClick={() => handleRemoveReferenceImage(image.id)}
                            >
                              {copy.actions.removeImage}
                            </button>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="reference-empty">
                        <p>{copy.empty.noReferenceImages}</p>
                      </div>
                    )}
                  </section>
                ) : null}

                <label className="field">
                  <span>{copy.fields.prompt}</span>
                  <textarea
                    data-testid="single-prompt"
                    className="prompt-textarea"
                    value={prompt}
                    onChange={(event) => handlePromptChange(event.target.value)}
                    rows={8}
                    placeholder={copy.fields.promptPlaceholder}
                  />
                </label>

                <div className="field-grid">
                  <label className="field image-name-field">
                    <span>{copy.fields.customName}</span>
                    <input
                      value={customName}
                      onChange={(event) => setCustomName(event.target.value)}
                      placeholder={copy.fields.customNamePlaceholder}
                    />
                  </label>

                  <div className="field field-readonly">
                    <span>{copy.fields.effectivePrompt}</span>
                    <div className="readonly-value">{effectivePrompt || copy.fields.effectivePromptPlaceholder}</div>
                  </div>
                </div>

                <label className="field">
                  <span>{copy.fields.optimizedPrompt}</span>
                  <textarea
                    className="prompt-textarea"
                    value={optimizedPrompt}
                    onChange={(event) => setOptimizedPrompt(event.target.value)}
                    rows={6}
                    placeholder={copy.fields.optimizedPromptPlaceholder}
                  />
                </label>
                {optimizedPrompt ? <p className="panel-note">{copy.notes.optimizedPromptLinked}</p> : null}

                <div className="action-row">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={handleOptimizePrompt}
                    disabled={isOptimizing || isGenerating || isLoadingApp}
                  >
                    {isOptimizing ? copy.actions.optimizeBusy : copy.actions.optimize}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setOptimizedPrompt("")}
                    disabled={!optimizedPrompt || isGenerating || isOptimizing}
                  >
                    {copy.actions.clearOptimized}
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    data-testid="single-generate"
                    onClick={handleGenerate}
                    disabled={isGenerating || isLoadingApp || !runtime || isOptimizing}
                  >
                    {isGenerating ? copy.actions.generateBusy : copy.actions.generate}
                  </button>
                </div>

                <div className="info-card">
                  <h3>{copy.cards.currentOutput}</h3>
                  <dl>
                    <div>
                      <dt>{copy.labels.mode}</dt>
                      <dd>{modeLabel}</dd>
                    </div>
                    <div>
                      <dt>{copy.labels.imageModel}</dt>
                      <dd>{config.imageModel}</dd>
                    </div>
                    <div>
                      <dt>{copy.labels.size}</dt>
                      <dd>{config.defaultSize}</dd>
                    </div>
                    <div>
                      <dt>{copy.labels.quality}</dt>
                      <dd>{qualityLabels[config.defaultQuality] ?? config.defaultQuality}</dd>
                    </div>
                    <div>
                      <dt>{copy.labels.format}</dt>
                      <dd>{formatLabels[config.defaultFormat] ?? config.defaultFormat}</dd>
                    </div>
                    {showCompressionControls ? (
                      <div>
                        <dt>{copy.labels.compression}</dt>
                        <dd>{config.defaultCompression}</dd>
                      </div>
                    ) : null}
                    <div>
                      <dt>{copy.labels.outputDirectory}</dt>
                      <dd>{outputDirectoryLabel}</dd>
                    </div>
                    <div>
                      <dt>{copy.labels.timeout}</dt>
                      <dd>{config.timeoutSeconds}s</dd>
                    </div>
                    {generationMode === "image-to-image" ? (
                      <div>
                        <dt>{copy.labels.sourceImages}</dt>
                        <dd>{referenceImages.length > 0 ? `${referenceImages.length}` : copy.empty.noReferenceImages}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {translatedValidationWarnings.length > 0 ? (
                    <p className="panel-note">{translatedValidationWarnings.join(" ")}</p>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div hidden={activeTab !== "batch"}>
              <BatchPanel
                config={config}
                runtime={runtime}
                language={language}
                onConfigChange={updateConfig}
                onHistoryChanged={async () => {
                  if (runtime) {
                    await reloadHistory(runtime);
                  }
                }}
                requireValidConfig={requireValidConfig}
                setAppMessage={setAppMessage}
                onBatchPreviewChange={setBatchPreviewStateWithCleanup}
                onBatchPreviewRelease={getReleasableBatchPreviewUrls}
                batchPreviewReleaseVersion={batchPreviewReleaseVersion}
                renderOutputOptions={renderQuickOutputOptions}
                onProviderProfileChange={handleProviderProfileChange}
                getRequestConfig={() => configRef.current}
              />
            </div>

            {activeTab === "history" ? (
              <div className="panel-body form-stack">
                <div className="stats-grid">
                  <div className="stat-card">
                    <span>{copy.cards.totalRecords}</span>
                    <strong>{history.length}</strong>
                  </div>
                  <div className="stat-card">
                    <span>{copy.cards.dateGroups}</span>
                    <strong>{historyGroups.length}</strong>
                  </div>
                </div>

                <div className="info-card">
                  <h3>{copy.cards.selectedRun}</h3>
                  {selectedRecord ? (
                    <>
                      <p>{selectedRecord.optimizedPrompt || selectedRecord.prompt}</p>
                      <dl>
                        <div>
                          <dt>{copy.labels.created}</dt>
                          <dd>{formatDateTime(selectedRecord.createdAt, language)}</dd>
                        </div>
                        <div>
                          <dt>{copy.labels.duration}</dt>
                          <dd>{formatDuration(selectedRecord.durationMs)}</dd>
                        </div>
                        <div>
                          <dt>{copy.labels.outputPath}</dt>
                          <dd>{selectedRecord.outputPath}</dd>
                        </div>
                      </dl>
                      <div className="action-row">
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => handleReusePrompt(selectedRecord)}
                        >
                          {copy.actions.reusePrompt}
                        </button>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => void handleStartEditFromImage(selectedRecord)}
                        >
                          {copy.actions.editFromImage}
                        </button>
                        {canOpenOutput ? (
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => void handleOpenOutput(selectedRecord)}
                          >
                            {copy.actions.openOutput}
                          </button>
                        ) : (
                          <span className="inline-note">{copy.notes.openOutputDesktopOnly}</span>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="empty-state">{copy.empty.noHistorySelected}</p>
                  )}
                </div>
              </div>
            ) : null}

            {activeTab === "settings" ? (
              <div className="panel-body form-stack">
                <section className="settings-section">
                  <div className="section-heading">
                    <h3>{copy.sections.providerProfiles}</h3>
                  </div>
                  <details className="help-details settings-help-details">
                    <summary>{copy.help.connectionNotes}</summary>
                    <div className="help-details-body">
                      <p>{copy.panel.settingsDescription}</p>
                    </div>
                  </details>
                  <div className="provider-profile-toolbar">
                    <label className="field">
                      <span>{copy.sections.providerProfiles}</span>
                      <select
                        data-testid="settings-provider-profile"
                        value={activeProviderProfile.id}
                        onChange={(event) => void handleProviderProfileChange(event.target.value)}
                      >
                        {config.providerProfiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="provider-profile-actions">
                      <span className="profile-status">
                        {copy.labels.activeProfile}: {activeProviderProfile.name}
                      </span>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={handleCreateProviderProfile}
                        disabled={config.providerProfiles.length >= MAX_PROVIDER_PROFILES}
                      >
                        {copy.actions.createProviderProfile}
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={handleDeleteProviderProfile}
                        disabled={config.providerProfiles.length <= 1}
                      >
                        {copy.actions.deleteProviderProfile}
                      </button>
                    </div>
                  </div>
                  <p className="panel-note">{copy.notes.providerProfileLimit}</p>
                  <div className="field-grid">
                    <label className="field">
                      <span>{copy.fields.providerProfileName}</span>
                      <input
                        value={activeProviderProfile.name}
                        onChange={(event) => updateProviderProfile("name", event.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span>{copy.fields.baseUrl}</span>
                      <input
                        data-testid="settings-base-url"
                        value={activeProviderProfile.baseUrl}
                        onChange={(event) => updateProviderProfile("baseUrl", event.target.value)}
                        placeholder="https://example.com/v1"
                      />
                    </label>

                    <label className="field">
                      <span>{copy.fields.apiKey}</span>
                      <input
                        data-testid="settings-api-key"
                        value={activeProviderProfile.apiKey}
                        onChange={(event) => updateProviderProfile("apiKey", event.target.value)}
                        placeholder="sk-..."
                        type="password"
                        autoComplete="off"
                      />
                    </label>
                  </div>
                  {runtime?.mode === "web" ? (
                    <>
                      <label className="toggle-row">
                        <input
                          data-testid="settings-remember-api-key"
                          type="checkbox"
                          checked={activeProviderProfile.rememberApiKey}
                          disabled={!canRememberWebApiKey}
                          onChange={(event) => updateProviderProfile("rememberApiKey", event.currentTarget.checked)}
                        />
                        <span>{copy.fields.rememberApiKey}</span>
                      </label>
                      <p className="inline-note">
                        {isMemoryOnlyWebRuntime
                          ? copy.notes.apiKeyMemoryOnlyHint
                          : storageCapabilities?.local === false
                            ? copy.notes.apiKeySessionOnlyHint
                            : copy.notes.apiKeyStorageHint}
                      </p>
                    </>
                  ) : null}

                  <div className="field-grid">
                    <label className="field">
                      <span>{copy.fields.textModel}</span>
                      <input
                        data-testid="settings-text-model"
                        value={activeProviderProfile.textModel}
                        onChange={(event) => updateProviderProfile("textModel", event.target.value)}
                      />
                    </label>

                    <label className="field">
                      <span>{copy.fields.imageModel}</span>
                      <input
                        data-testid="settings-image-model"
                        value={activeProviderProfile.imageModel}
                        onChange={(event) => updateProviderProfile("imageModel", event.target.value)}
                      />
                    </label>
                  </div>
                  <label className="field profile-response-mode-field">
                    <span>{copy.fields.imageResponseMode}</span>
                    <select
                      value={activeProviderProfile.imageResponseMode}
                      onChange={(event) =>
                        updateProviderProfile("imageResponseMode", event.target.value as ProviderProfile["imageResponseMode"])
                      }
                    >
                      <option value="official">{copy.options.imageResponseModeOfficial}</option>
                      <option value="force-base64">{copy.options.imageResponseModeForceBase64}</option>
                    </select>
                  </label>
                  <p className="panel-note">{copy.notes.imageResponseModeHint}</p>
                </section>

                <section className="settings-section">
                  <div className="section-heading">
                    <h3>{copy.sections.defaults}</h3>
                  </div>
                  <details className="help-details settings-help-details">
                    <summary>{copy.help.defaultParameterNotes}</summary>
                    <div className="help-details-body">
                      <p>{copy.notes.defaultsDescription}</p>
                      <p>{copy.batch.fields.autoPlanTaskCountHint}</p>
                      <p>{copy.notes.sizeConstraintsHint}</p>
                      {sizeMode === "custom" ? <p>{copy.notes.customSizeHint}</p> : null}
                      {showCompressionControls ? <p>{copy.notes.compressionHint}</p> : null}
                    </div>
                  </details>

                  <div className="field-grid">
                    <label className="field">
                      <span>{copy.fields.timeoutSeconds}</span>
                      <input
                        type="number"
                        min={60}
                        max={600}
                        step={1}
                        value={config.timeoutSeconds}
                        onChange={(event) => updateConfig("timeoutSeconds", Number(event.target.value) || 0)}
                      />
                    </label>

                    <p className="field-note">{copy.notes.oneImagePerTask}</p>

                    <label className="field">
                      <span>{copy.batch.fields.taskCount}</span>
                      <input
                        type="number"
                        min={1}
                        max={MAX_BATCH_TASK_COUNT}
                        step={1}
                        value={config.batchDefaultTaskCount}
                        onChange={(event) =>
                          updateConfig("batchDefaultTaskCount", clampBatchTaskCount(Number(event.target.value) || 1))
                        }
                      />
                    </label>

                    <label className="field">
                      <span>{copy.batch.fields.autoPlanTaskCount}</span>
                      <select
                        value={config.batchAutoPlanTaskCount ? "true" : "false"}
                        onChange={(event) => updateConfig("batchAutoPlanTaskCount", event.target.value === "true")}
                      >
                        <option value="true">{copy.options.enabled}</option>
                        <option value="false">{copy.options.disabled}</option>
                      </select>
                    </label>
                  </div>

                  <div className="field-grid">
                    <label className="field">
                      <span>{copy.fields.defaultSize}</span>
                      <select value={selectedSizeOption} onChange={(event) => handleSizePresetChange(event.target.value)}>
                        {imageSizeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field">
                      <span>{copy.fields.defaultQuality}</span>
                      <select
                        value={config.defaultQuality}
                        onChange={(event) => handleQualityChange(event.target.value as AppConfig["defaultQuality"])}
                      >
                        <option value="auto">{copy.options.qualityAuto}</option>
                        <option value="low">{copy.options.qualityLow}</option>
                        <option value="medium">{copy.options.qualityMedium}</option>
                        <option value="high">{copy.options.qualityHigh}</option>
                      </select>
                    </label>
                  </div>

                  {sizeMode === "custom" ? (
                    <div className="field-grid">
                      <label className="field">
                        <span>{copy.fields.customWidth}</span>
                        <input
                          type="number"
                          min={16}
                          max={3840}
                          step={16}
                          value={customWidthInput}
                          onChange={(event) => handleCustomWidthChange(event.target.value)}
                          placeholder="1024"
                        />
                      </label>

                      <label className="field">
                        <span>{copy.fields.customHeight}</span>
                        <input
                          type="number"
                          min={16}
                          max={3840}
                          step={16}
                          value={customHeightInput}
                          onChange={(event) => handleCustomHeightChange(event.target.value)}
                          placeholder="1024"
                        />
                      </label>
                    </div>
                  ) : null}

                  <div className="field-grid">
                    <label className="field">
                      <span>{copy.fields.defaultFormat}</span>
                      <select
                        value={config.defaultFormat}
                        onChange={(event) => handleFormatChange(event.target.value as AppConfig["defaultFormat"])}
                      >
                        <option value="png">{copy.options.formatPng}</option>
                        <option value="jpeg">{copy.options.formatJpeg}</option>
                        <option value="webp">{copy.options.formatWebp}</option>
                      </select>
                    </label>

                    {showCompressionControls ? (
                      <label className="field">
                        <span>{copy.fields.defaultCompression}</span>
                        <div className="range-field">
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={config.defaultCompression}
                            onChange={(event) => handleCompressionChange(event.target.value)}
                          />
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={config.defaultCompression}
                            onChange={(event) => handleCompressionChange(event.target.value)}
                          />
                        </div>
                      </label>
                    ) : (
                      <div className="field field-readonly">
                        <span>{copy.fields.defaultCompression}</span>
                        <div className="readonly-value">{copy.notes.compressionUnavailable}</div>
                      </div>
                    )}
                  </div>

                  {sizeValidation.warning ? (
                    <p className="panel-note highlight-note">
                      {copy.validation[sizeValidation.warning] ?? sizeValidation.warning}
                    </p>
                  ) : null}
                </section>

                <section className="settings-section">
                  <div className="section-heading">
                    <h3>{copy.sections.output}</h3>
                  </div>
                  <details className="help-details settings-help-details">
                    <summary>{copy.help.outputFolderNotes}</summary>
                    <div className="help-details-body">
                      <p>{copy.notes.outputDescription}</p>
                      <p>{copy.notes.outputDirectoryPermissionHint}</p>
                    </div>
                  </details>

                  <div className="field-grid single-column">
                    <div className="field field-readonly">
                      <span>{copy.fields.outputDirectory}</span>
                      <div className="readonly-value">{outputDirectoryLabel}</div>
                    </div>
                  </div>

                  <div className="output-directory-status" role="status">
                    <strong>{copy.notes.outputDirectoryStatusTitle}</strong>
                    <span>{outputDirectoryStateMessage}</span>
                  </div>

                  <div className="action-row">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={handleChooseDirectory}
                      disabled={!runtime}
                    >
                      {copy.actions.chooseDirectory}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={handleTestOutputDirectory}
                      disabled={!runtime || isTestingOutputDirectory}
                    >
                      {isTestingOutputDirectory ? copy.actions.testOutputDirectoryBusy : copy.actions.testOutputDirectory}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={handleTestTextModel}
                      disabled={isTestingText}
                    >
                      {isTestingText ? copy.actions.testTextBusy : copy.actions.testText}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={handleTestImageModel}
                      disabled={isTestingImage}
                    >
                      {isTestingImage ? copy.actions.testImageBusy : copy.actions.testImage}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={handleTestImageEdit}
                      disabled={isTestingImageEdit}
                    >
                      {isTestingImageEdit ? copy.actions.testImageEditBusy : copy.actions.testImageEdit}
                    </button>
                    <button
                      type="button"
                      className="primary-button"
                      data-testid="settings-save"
                      onClick={handleSaveSettings}
                      disabled={isSavingSettings || !runtime}
                    >
                      {isSavingSettings ? copy.actions.saveBusy : copy.actions.save}
                    </button>
                  </div>

                  {settingsMessage.text ? (
                    <div className={`message-card inline-message ${settingsMessage.tone}`}>{settingsMessage.text}</div>
                  ) : null}

                  <details className="help-details settings-help-details">
                    <summary>{copy.help.imageToImageTestNotes}</summary>
                    <div className="help-details-body">
                      <p>{copy.notes.imageEditTestDescription}</p>
                    </div>
                  </details>
                </section>

                <section className="settings-section version-card">
                  <div className="section-heading">
                    <h3>{copy.sections.version}</h3>
                    <p>{copy.notes.currentVersionManualUpdate}</p>
                  </div>

                  <dl className="compact-meta">
                    <div>
                      <dt>{copy.labels.currentVersion}</dt>
                      <dd>{APP_VERSION}</dd>
                    </div>
                    <div>
                      <dt>{copy.labels.latestVersion}</dt>
                      <dd>
                        <a href={GITHUB_PAGES_URL} target="_blank" rel="noreferrer">
                          {copy.labels.latestVersion}
                        </a>
                      </dd>
                    </div>
                    <div>
                      <dt>{copy.labels.archivedVersion}</dt>
                      <dd>
                        <a href={ARCHIVED_VERSION_URL} target="_blank" rel="noreferrer">
                          v{ARCHIVED_VERSION}
                        </a>
                      </dd>
                    </div>
                    <div>
                      <dt>{copy.app.statusLabel}</dt>
                      <dd>{formatMode(runtime?.mode ?? null, language)}</dd>
                    </div>
                    <div>
                      <dt>{copy.batch.fields.taskCount}</dt>
                      <dd>{config.batchDefaultTaskCount}</dd>
                    </div>
                    <div>
                      <dt>{copy.batch.fields.autoPlanTaskCount}</dt>
                      <dd>{config.batchAutoPlanTaskCount ? copy.options.enabled : copy.options.disabled}</dd>
                    </div>
                    <div>
                      <dt>{copy.batch.fields.concurrency}</dt>
                      <dd>{config.batchDefaultConcurrency}</dd>
                    </div>
                    <div>
                      <dt>{copy.batch.fields.intervalSeconds}</dt>
                      <dd>{config.batchDefaultIntervalSeconds}</dd>
                    </div>
                    <div>
                      <dt>{copy.batch.fields.maxRetries}</dt>
                      <dd>{config.batchDefaultMaxRetries}</dd>
                    </div>
                  </dl>

                  <div className="action-row">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setIsUpdateOpen(true);
                        setSettingsMessage({
                          tone: "neutral",
                          text: copy.messages.updateStatus(APP_VERSION),
                        });
                      }}
                    >
                      {copy.actions.checkUpdates}
                    </button>
                    <a className="secondary-button link-button" href={GITHUB_PAGES_URL} target="_blank" rel="noreferrer">
                      {copy.actions.openLatestVersion}
                    </a>
                    <a className="secondary-button link-button" href={ARCHIVED_VERSION_URL} target="_blank" rel="noreferrer">
                      {copy.actions.openArchivedVersion} ({ARCHIVED_VERSION})
                    </a>
                  </div>
                  <p className="microcopy">{copy.notes.versionSwitchHint}</p>
                </section>

                <section className="settings-section open-source-card">
                  <div className="section-heading">
                    <h3>{copy.cards.openSourceTitle}</h3>
                    <p>{copy.cards.openSourceHint}</p>
                  </div>

                  <div className="action-row">
                    <a
                      className="secondary-button link-button"
                      href={MINIMAL_API_EXAMPLE_URL}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {copy.actions.viewMinimalApiExample}
                    </a>
                    <a
                      className="secondary-button link-button"
                      href={GITHUB_PROJECT_URL}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {copy.actions.openGithubProject}
                    </a>
                  </div>
                </section>

                {translatedValidationErrors.length > 0 ? (
                  <div className="validation-list error">
                    <h3>{copy.panel.settingsTitle}</h3>
                    <ul>
                      {translatedValidationErrors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {translatedValidationWarnings.length > 0 ? (
                  <div className="validation-list warning">
                    <h3>{copy.cards.currentOutput}</h3>
                    <ul>
                      {translatedValidationWarnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="panel preview-panel">
            <header className="panel-header">
              <div>
                <h2>{copy.panel.previewTitle}</h2>
                <p>
                  {activeBatchPreview
                    ? isHistoryBatchPreviewActive
                      ? copy.preview.batchHistoryBody
                      : copy.preview.batchBody
                    : previewState.status === "running"
                    ? copy.panel.previewRunningDescription
                    : copy.panel.previewIdleDescription}
                </p>
              </div>
              {!activeBatchPreview && previewState.status === "running" ? (
                <div className="timer-pill">{formatDuration(elapsedMs)}</div>
              ) : null}
            </header>

            <div className="panel-body preview-body">
              {isLoadingApp ? <p className="empty-state">{copy.empty.loadingRuntime}</p> : null}

              {!isLoadingApp && activeBatchPreview ? (
                <div className="preview-success batch-preview">
                  {activeBatchPreview.latestImage ? (
                    <button
                      type="button"
                      className="preview-frame preview-frame-button"
                      onClick={() =>
                        setLightboxImageWithCleanup({
                          src: activeBatchPreview.latestImage!.previewUrl,
                          title: activeBatchPreview.latestImage!.title,
                          prompt: activeBatchPreview.latestImage!.prompt,
                        })
                      }
                      aria-label={copy.actions.viewLarge}
                    >
                      <img src={activeBatchPreview.latestImage.previewUrl} alt={activeBatchPreview.latestImage.title} />
                    </button>
                  ) : (
                    <div className="preview-placeholder running">{copy.preview.batch}</div>
                  )}

                  <div className="info-card preview-details">
                    <h3>{isHistoryBatchPreviewActive && historyBatchPreviewTitle ? historyBatchPreviewTitle : copy.preview.batch}</h3>
                    <dl>
                      <div>
                        <dt>{copy.labels.status}</dt>
                        <dd>{copy.batch.status[activeBatchPreview.status]}</dd>
                      </div>
                      <div>
                        <dt>{copy.labels.totalRecords}</dt>
                        <dd>{activeBatchPreview.summary.total}</dd>
                      </div>
                      <div>
                        <dt>{copy.batch.status.succeeded}</dt>
                        <dd>{activeBatchPreview.summary.succeeded}</dd>
                      </div>
                      <div>
                        <dt>{copy.batch.status.failed}</dt>
                        <dd>{activeBatchPreview.summary.failed}</dd>
                      </div>
                      <div>
                        <dt>{copy.batch.status.skipped}</dt>
                        <dd>{activeBatchPreview.summary.skipped}</dd>
                      </div>
                    </dl>
                    {activeBatchPreview.latestImage ? (
                      <>
                        <p className="panel-note">{copy.preview.batchLatest}</p>
                        <p>{activeBatchPreview.latestImage.prompt}</p>
                      </>
                    ) : activeBatchPreview.runningTask ? (
                      <>
                        <p className="panel-note">{copy.preview.batchRunning(activeBatchPreview.runningTask.title)}</p>
                        <p>{activeBatchPreview.runningTask.prompt}</p>
                      </>
                    ) : (
                      <p>{copy.preview.batchNoImage}</p>
                    )}
                  </div>

                  {activeBatchPreview.images.length > 0 ? (
                    <div className="info-card preview-details batch-preview-gallery">
                      <h3>{copy.preview.batchGallery}</h3>
                      <div className="batch-preview-grid">
                        {activeBatchPreview.images.map((image) => (
                          <figure key={image.id} className="batch-preview-thumb">
                            <button
                              type="button"
                              className="batch-preview-thumb-button"
                              onClick={() =>
                                setLightboxImageWithCleanup({
                                  src: image.previewUrl,
                                  title: image.title,
                                  prompt: image.prompt,
                                })
                              }
                              aria-label={copy.actions.viewLarge}
                            >
                              <img src={image.previewUrl} alt={image.title} />
                            </button>
                            <figcaption title={image.title}>{image.title}</figcaption>
                            <button
                              type="button"
                              className="ghost-button compact-button"
                              onClick={() =>
                                void handleStartEditFromImage(
                                  {
                                    id: image.id,
                                    status: "success",
                                    createdAt: image.completedAt,
                                    prompt: image.prompt,
                                    optimizedPrompt: "",
                                    model: config.imageModel,
                                    size: config.defaultSize,
                                    outputPath: image.outputPath,
                                    durationMs: image.durationMs,
                                  },
                                  image.previewUrl,
                                )
                              }
                            >
                              {copy.actions.editFromImage}
                            </button>
                          </figure>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {!isLoadingApp && !activeBatchPreview && previewState.status === "idle" ? (
                <div className="preview-state">
                  <div className="preview-placeholder">{copy.preview.idle}</div>
                  <p>{copy.preview.idleBody}</p>
                  {selectedRecord ? (
                    <div className="info-card preview-details">
                      <h3>{copy.cards.lastSelectedHistoryItem}</h3>
                      <p>{selectedRecord.optimizedPrompt || selectedRecord.prompt}</p>
                      <dl>
                        <div>
                          <dt>{copy.labels.created}</dt>
                          <dd>{formatDateTime(selectedRecord.createdAt, language)}</dd>
                        </div>
                        <div>
                          <dt>{copy.labels.status}</dt>
                          <dd>{selectedRecord.status}</dd>
                        </div>
                      </dl>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {!activeBatchPreview && previewState.status === "running" ? (
                <div className="preview-state">
                  <div className="preview-placeholder running">{copy.preview.running}</div>
                  <p>{previewState.prompt}</p>
                  <p className="panel-note">{copy.preview.runningHint}</p>
                </div>
              ) : null}

              {!activeBatchPreview && previewState.status === "failed" ? (
                <div className="preview-state">
                  <div className="preview-placeholder failed">{copy.preview.failed}</div>
                  <p>{previewState.prompt}</p>
                  <p className="error-copy">{previewState.message}</p>
                  <p className="panel-note">
                    {copy.preview.elapsedPrefix}
                    {formatDuration(previewState.durationMs)}
                  </p>
                </div>
              ) : null}

              {!activeBatchPreview && previewState.status === "history-unavailable" ? (
                <div className="preview-state">
                  <div className="preview-placeholder">{copy.preview.history}</div>
                  <div className="info-card preview-details">
                    <h3>{copy.cards.selectedHistoryItem}</h3>
                    <p>{previewState.record.optimizedPrompt || previewState.record.prompt}</p>
                    <dl>
                      <div>
                        <dt>{copy.labels.created}</dt>
                        <dd>{formatDateTime(previewState.record.createdAt, language)}</dd>
                      </div>
                      <div>
                        <dt>{copy.labels.outputPath}</dt>
                        <dd>{previewState.record.outputPath}</dd>
                      </div>
                    </dl>
                  </div>
                  <p className="panel-note">{copy.help.historyPreviewMissingShort}</p>
                  <details className="help-details history-preview-help">
                    <summary>{copy.help.historyPreviewTroubleshooting}</summary>
                    <div className="help-details-body">
                      <p>{previewState.message}</p>
                    </div>
                  </details>
                </div>
              ) : null}

              {!activeBatchPreview && previewState.status === "success" ? (
                <div className="preview-success">
                  <button
                    type="button"
                    className="preview-frame preview-frame-button"
                    onClick={() =>
                      setLightboxImageWithCleanup({
                        src: previewState.imageUrl,
                        title: previewState.customName || previewState.record.outputPath.split(/[\\/]/).pop() || copy.cards.savedImage,
                        prompt: previewState.optimizedPrompt || previewState.prompt,
                      })
                    }
                    aria-label={copy.actions.viewLarge}
                  >
                    <img
                      src={previewState.imageUrl}
                      alt={previewState.prompt}
                      onError={() => handlePreviewImageError(previewState)}
                    />
                  </button>
                  <div className="info-card preview-details">
                    <h3>{copy.cards.savedImage}</h3>
                    <dl>
                      <div>
                        <dt>{copy.labels.created}</dt>
                        <dd>{formatDateTime(previewState.record.createdAt, language)}</dd>
                      </div>
                      <div>
                        <dt>{copy.labels.duration}</dt>
                        <dd>{formatDuration(previewState.record.durationMs)}</dd>
                      </div>
                      <div>
                        <dt>{copy.labels.outputPath}</dt>
                        <dd>{previewState.record.outputPath}</dd>
                      </div>
                      <div>
                        <dt>{copy.labels.customName}</dt>
                        <dd>{previewState.customName || copy.preview.autoNamed}</dd>
                      </div>
                      {previewState.saveMode ? (
                        <div>
                          <dt>{copy.labels.saveMode}</dt>
                          <dd>{saveModeLabels[previewState.saveMode]}</dd>
                        </div>
                      ) : null}
                    </dl>
                    {previewState.saveFallbackReason ? (
                      <div className="message-card warning inline-message">
                        {copy.messages.saveFallbackToBrowserDownload(previewState.saveFallbackReason)}
                      </div>
                    ) : null}
                    {previewState.historyDurability === "memory-only" && previewState.historyWarning ? (
                      <div className="message-card warning inline-message" data-testid="single-history-durability-warning">
                        {previewState.historyWarning}
                      </div>
                    ) : null}
                    <p>{previewState.optimizedPrompt || previewState.prompt}</p>
                    <div className="action-row">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => handleReusePrompt(previewState.record)}
                      >
                        {copy.actions.reusePrompt}
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => void handleStartEditFromImage(previewState.record, previewState.imageUrl)}
                      >
                        {copy.actions.editFromImage}
                      </button>
                      {canOpenOutput ? (
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => void handleOpenOutput(previewState.record)}
                        >
                          {copy.actions.openOutput}
                        </button>
                      ) : (
                        <span className="inline-note">{copy.notes.openOutputDesktopOnly}</span>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          <section className="panel history-panel">
            <header className="panel-header">
              <div>
                <h2>{copy.panel.historyTitle}</h2>
                <p>{copy.panel.historyDescription}</p>
              </div>
              <div className="history-count">{history.length}</div>
            </header>

            <div className="panel-body history-body">
              {historyDisplayGroups.length === 0 ? (
                <p className="empty-state">{copy.empty.noHistorySaved}</p>
              ) : (
                historyDisplayGroups.map((group) => (
                  <section key={group.date} className="history-group">
                    <div className="history-group-header">
                      <h3>{group.date}</h3>
                      <span>{group.records.length}</span>
                    </div>

                    <div className="history-list">
                      {group.items.map((item) => {
                        if (item.type === "batch") {
                          const isExpanded = expandedBatchIds.has(item.id);
                          const isSelected = item.records.some((record) => record.id === selectedHistoryId);
                          const succeededCount = item.records.filter((record) => record.status === "success").length;
                          const totalCount = item.totalTasks ?? item.records.length;
                          const durationMs = item.records.reduce((sum, record) => sum + record.durationMs, 0);

                          return (
                            <article
                              key={item.id}
                              className={`history-item history-batch-card ${isSelected ? "selected" : ""}`}
                            >
                              <div className="history-item-head">
                                <span className="status-pill success">{copy.labels.batch}</span>
                                <time dateTime={item.createdAt}>{formatDateTime(item.createdAt, language)}</time>
                              </div>
                              <p className="history-prompt history-batch-title">{item.title}</p>
                              <dl className="history-meta">
                                <div>
                                  <dt>{copy.labels.tasks}</dt>
                                  <dd>
                                    {succeededCount} / {totalCount}
                                  </dd>
                                </div>
                                <div>
                                  <dt>{copy.labels.model}</dt>
                                  <dd>{getHistoryProviderLabel(item.records[0], copy.labels.legacyProvider)}</dd>
                                </div>
                                <div>
                                  <dt>{copy.labels.duration}</dt>
                                  <dd>{formatDuration(durationMs)}</dd>
                                </div>
                              </dl>
                              <div className="history-actions">
                                <button
                                  type="button"
                                  className="ghost-button"
                                  onClick={() => void handleInspectHistoryBatch(item)}
                                >
                                  {copy.actions.inspectBatch}
                                </button>
                                <button
                                  type="button"
                                  className="ghost-button"
                                  onClick={() => toggleHistoryBatch(item.id)}
                                >
                                  {isExpanded ? copy.actions.collapseBatch : copy.actions.expandBatch}
                                </button>
                              </div>

                              {isExpanded ? (
                                <div className="history-batch-task-list">
                                  {item.records.map((record) => (
                                    <article key={record.id} className="history-batch-task">
                                      <div className="history-item-head">
                                        <strong>{record.batch?.taskTitle ?? record.outputPath.split(/[\\/]/).pop()}</strong>
                                        <span className={`status-pill ${record.status}`}>{record.status}</span>
                                      </div>
                                      <p className="history-prompt">{record.optimizedPrompt || record.prompt}</p>
                                      <p className="history-prompt">{getHistoryProviderLabel(record, copy.labels.legacyProvider)}</p>
                                      <div className="history-actions">
                                        <button
                                          type="button"
                                          className="ghost-button"
                                          onClick={() => void handleInspectHistory(record)}
                                        >
                                          {copy.actions.inspect}
                                        </button>
                                        <button
                                          type="button"
                                          className="ghost-button"
                                          onClick={() => handleReusePrompt(record)}
                                        >
                                          {copy.actions.reusePrompt}
                                        </button>
                                        <button
                                          type="button"
                                          className="ghost-button"
                                          onClick={() => void handleStartEditFromImage(record)}
                                        >
                                          {copy.actions.editFromImage}
                                        </button>
                                      </div>
                                    </article>
                                  ))}
                                </div>
                              ) : null}
                            </article>
                          );
                        }

                        const record = item.record;

                        return (
                          <article
                            key={record.id}
                            className={`history-item ${record.id === selectedHistoryId ? "selected" : ""}`}
                          >
                            <div className="history-item-head">
                              <span className={`status-pill ${record.status}`}>{record.status}</span>
                              <time dateTime={record.createdAt}>{formatDateTime(record.createdAt, language)}</time>
                            </div>
                            <p className="history-prompt">{record.optimizedPrompt || record.prompt}</p>
                            <dl className="history-meta">
                              <div>
                                <dt>{copy.labels.model}</dt>
                                <dd>{getHistoryProviderLabel(record, copy.labels.legacyProvider)}</dd>
                              </div>
                              <div>
                                <dt>{copy.labels.duration}</dt>
                                <dd>{formatDuration(record.durationMs)}</dd>
                              </div>
                            </dl>
                            <div className="history-actions">
                              <button
                                type="button"
                                className="ghost-button"
                                onClick={() => void handleInspectHistory(record)}
                              >
                                {copy.actions.inspect}
                              </button>
                              <button
                                type="button"
                                className="ghost-button"
                                onClick={() => handleReusePrompt(record)}
                              >
                                {copy.actions.reusePrompt}
                              </button>
                              <button
                                type="button"
                                className="ghost-button"
                                onClick={() => void handleStartEditFromImage(record)}
                              >
                                {copy.actions.editFromImage}
                              </button>
                              {canOpenOutput ? (
                                <button
                                  type="button"
                                  className="ghost-button"
                                  onClick={() => void handleOpenOutput(record)}
                                >
                                  {copy.actions.openOutput}
                                </button>
                              ) : null}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                ))
              )}
            </div>
          </section>
        </section>
      </main>

      <Dialog
        open={showWelcome}
        title={copy.welcome.title}
        onClose={() => void handleDismissWelcome()}
        className="welcome-modal"
        footer={
          <>
            <button type="button" className="secondary-button" onClick={() => void handleDismissWelcome()}>
              {copy.actions.setUpLater}
            </button>
            <button type="button" className="primary-button" onClick={() => void handleWelcomePrimaryAction()}>
              {isWelcomeSetupComplete ? copy.actions.startUsing : copy.actions.goToSettings}
            </button>
          </>
        }
      >
        <section className="welcome-content">
          <div className="welcome-intro">
            <p className="eyebrow">{copy.welcome.eyebrow}</p>
            <p>{copy.welcome.intro}</p>
          </div>

          <div className="welcome-setup">
            <h3>{copy.welcome.setupTitle}</h3>
            <ol className="welcome-steps">
              {copy.welcome.setupSteps.map((step, index) => (
                <li className="welcome-step" key={step.title}>
                  <span className="welcome-step-number" aria-hidden="true">
                    {index + 1}
                  </span>
                  <div>
                    <strong>{step.title}</strong>
                    <p>{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <p className="welcome-privacy">{copy.welcome.privacyNote}</p>
          <p className="welcome-relay">
            {copy.welcome.relayPrompt}{" "}
            <button
              type="button"
              className="welcome-relay-link"
              onClick={() => void handleOpenRecommendedRelay()}
            >
              {copy.actions.openRecommended}
            </button>
          </p>
        </section>
      </Dialog>

      <Dialog
        open={Boolean(editFromImageDraft)}
        title={copy.cards.editFromImageTitle}
        onClose={() => {
          setEditFromImageDraft(null);
          setEditInstructions("");
        }}
        footer={
          <>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setEditFromImageDraft(null);
                setEditInstructions("");
              }}
            >
              {copy.actions.close}
            </button>
            <button type="button" className="primary-button" onClick={handleConfirmEditFromImage}>
              {copy.actions.editFromImage}
            </button>
          </>
        }
      >
        <div className="edit-from-image-modal">
          {editFromImageDraft ? (
            <div className="info-card">
              <h3>{copy.cards.selectedHistoryItem}</h3>
              <p>{editFromImageDraft.record.optimizedPrompt || editFromImageDraft.record.prompt}</p>
            </div>
          ) : null}
          <label className="field">
            <span>{copy.fields.editInstructions}</span>
            <textarea
              className="prompt-textarea compact-textarea"
              value={editInstructions}
              onChange={(event) => setEditInstructions(event.target.value)}
              rows={4}
              placeholder={copy.fields.editInstructionsPlaceholder}
            />
          </label>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(lightboxImage)}
        title={lightboxImage?.title ?? copy.actions.viewLarge}
        onClose={() => setLightboxImageWithCleanup(null)}
        size="wide"
        className="lightbox-modal"
        footer={
          <button type="button" className="primary-button" onClick={() => setLightboxImageWithCleanup(null)}>
            {copy.actions.close}
          </button>
        }
      >
        {lightboxImage ? (
          <div className="lightbox-content">
            <img src={lightboxImage.src} alt={lightboxImage.title} />
            {lightboxImage.prompt ? <p>{lightboxImage.prompt}</p> : null}
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={isUpdateOpen}
        title={copy.sections.version}
        onClose={() => setIsUpdateOpen(false)}
        footer={
          <button type="button" className="primary-button" onClick={() => setIsUpdateOpen(false)}>
            {copy.actions.close}
          </button>
        }
      >
        <div className="update-modal">
          <div className="info-card">
            <h3>{copy.labels.currentVersion}</h3>
            <p className="version-number">{APP_VERSION}</p>
            <p>{copy.messages.updateStatus(APP_VERSION)}</p>
          </div>
        </div>
      </Dialog>

    </>
  );
}
