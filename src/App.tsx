import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";

import packageJson from "../package.json";
import paymentQrCode from "./assets/payment-wechat-qr.png";
import {
  generateImages,
  optimizePrompt,
  testImageEditModel,
  testImageModel,
  testTextModel,
} from "./core/apiClient";
import { DEFAULT_CONFIG, mergeConfig, type AppConfig, validateConfig } from "./core/config";
import {
  filterHistoryRecords,
  groupHistoryByDate,
  type HistoryStatusFilter,
  type ImageRecord,
} from "./core/history";
import {
  MAX_REFERENCE_IMAGES,
  addReferenceImages,
  type AddReferenceImagesResult,
  type ReferenceImageItem,
} from "./core/referenceImages";
import {
  BUILT_IN_PROMPT_TEMPLATES,
  createCustomPromptTemplate,
  filterPromptTemplates,
  getPromptTemplateCategories,
  mergePromptTemplates,
  removeCustomPromptTemplate,
  type PromptTemplate,
  type PromptTemplateCategory,
} from "./core/promptTemplates";
import {
  getImageSizePresetValue,
  isCompressionFormat,
  parseImageSize,
  validateImageSize,
} from "./core/imageOptions";
import { formatClassifiedError, getTranslations, resolveLanguage, type UiLanguage } from "./i18n/translations";
import { getRuntimeAdapter } from "./runtime";
import type { RuntimeAdapter } from "./runtime/types";

const APP_VERSION = packageJson.version;
const RECOMMENDED_RELAY_URL = "https://ruoli.dev/register?aff=mR35";
const DEFAULT_CUSTOM_SIZE = { width: "1024", height: "1024" };

type AppTab = "generate" | "history" | "settings";
type GenerationMode = "text-to-image" | "image-to-image";

type SettingsMessage = {
  tone: "neutral" | "success" | "error";
  text: string;
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
  return error instanceof Error ? error.message : "Something went wrong.";
}

function getApiErrorMessage(error: unknown, language: UiLanguage): string {
  return formatClassifiedError(error, language);
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
    URL.revokeObjectURL(image.previewUrl);
  }
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
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [persistedConfig, setPersistedConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [history, setHistory] = useState<ImageRecord[]>([]);
  const [activeTab, setActiveTab] = useState<AppTab>("generate");
  const [generationMode, setGenerationMode] = useState<GenerationMode>("text-to-image");
  const [prompt, setPrompt] = useState("");
  const [optimizedPrompt, setOptimizedPrompt] = useState("");
  const [customName, setCustomName] = useState("");
  const [referenceImages, setReferenceImages] = useState<ReferenceImageItem[]>([]);
  const [templateQuery, setTemplateQuery] = useState("");
  const [templateCategory, setTemplateCategory] = useState<PromptTemplateCategory | "all">("all");
  const [customTemplateTitle, setCustomTemplateTitle] = useState("");
  const [customTemplateCategory, setCustomTemplateCategory] = useState<PromptTemplateCategory>("custom");
  const [previewState, setPreviewState] = useState<PreviewState>({ status: "idle" });
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<Set<string>>(() => new Set());
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyStatusFilter, setHistoryStatusFilter] = useState<HistoryStatusFilter>("all");
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
  const [isDeletingHistory, setIsDeletingHistory] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [isQrZoomed, setIsQrZoomed] = useState(false);
  const [isUpdateOpen, setIsUpdateOpen] = useState(false);
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

  const language = resolveLanguage(config.uiLanguage);
  const copy = getTranslations(language);
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
  const filteredHistory = useMemo(
    () => filterHistoryRecords(history, { query: historyQuery, status: historyStatusFilter }),
    [history, historyQuery, historyStatusFilter],
  );
  const historyGroups = useMemo(() => groupHistoryByDate(filteredHistory), [filteredHistory]);
  const promptTemplates = useMemo(
    () => mergePromptTemplates(config.customPromptTemplates, BUILT_IN_PROMPT_TEMPLATES),
    [config.customPromptTemplates],
  );
  const promptTemplateCategories = useMemo(() => getPromptTemplateCategories(promptTemplates), [promptTemplates]);
  const filteredPromptTemplates = useMemo(
    () => filterPromptTemplates(promptTemplates, { category: templateCategory, query: templateQuery }),
    [promptTemplates, templateCategory, templateQuery],
  );
  const effectivePrompt = optimizedPrompt.trim() || prompt.trim();
  const canOpenOutput = runtime?.mode === "desktop";
  const selectedHistoryCount = selectedHistoryIds.size;
  const selectedRecord = useMemo(
    () => history.find((record) => record.id === selectedHistoryId) ?? null,
    [history, selectedHistoryId],
  );
  const selectedSizeOption = sizeMode === "custom" ? "custom" : getImageSizePresetValue(config.defaultSize);
  const showCompressionControls = isCompressionFormat(config.defaultFormat);
  const showWelcome = !isLoadingApp && !config.hasDismissedWelcome;
  const qualityLabels: Record<AppConfig["defaultQuality"], string> = {
    auto: copy.options.qualityAuto,
    low: copy.options.qualityLow,
    medium: copy.options.qualityMedium,
    high: copy.options.qualityHigh,
  };
  const formatLabels: Record<AppConfig["defaultFormat"], string> = {
    png: copy.options.formatPng,
    jpeg: copy.options.formatJpeg,
    webp: copy.options.formatWebp,
  };
  const historyStatusLabels: Record<HistoryStatusFilter, string> = {
    all: copy.options.statusAll,
    success: copy.options.statusSuccess,
    failed: copy.options.statusFailed,
    cancelled: copy.options.statusCancelled,
  };
  const promptTemplateCategoryLabels: Record<PromptTemplateCategory | "all", string> = {
    all: copy.options.categoryAll,
    portrait: copy.options.categoryPortrait,
    product: copy.options.categoryProduct,
    social: copy.options.categorySocial,
    style: copy.options.categoryStyle,
    custom: copy.options.categoryCustom,
  };
  const imageSizeOptions = useMemo(
    () => [
      { value: "auto", label: copy.options.sizeAuto },
      { value: "1024x1024", label: copy.options.size1kSquare },
      { value: "1536x1024", label: copy.options.size1kLandscape },
      { value: "1024x1536", label: copy.options.size1kPortrait },
      { value: "2048x2048", label: copy.options.size2kSquare },
      { value: "2048x1152", label: copy.options.size2kLandscape },
      { value: "3840x2160", label: copy.options.size4kLandscape },
      { value: "2160x3840", label: copy.options.size4kPortrait },
      { value: "custom", label: copy.options.sizeCustom },
    ],
    [copy],
  );

  useEffect(() => {
    promptRef.current = prompt;
  }, [prompt]);

  useEffect(() => {
    referenceImagesRef.current = referenceImages;
  }, [referenceImages]);

  useEffect(() => {
    return () => {
      revokeReferenceImages(referenceImagesRef.current);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadApp() {
      try {
        const adapter = await getRuntimeAdapter();
        const [loadedConfig, loadedHistory] = await Promise.all([
          adapter.loadConfig(),
          adapter.loadHistory(),
        ]);
        const mergedConfig = mergeConfig(loadedConfig);
        const nextLanguage = resolveLanguage(mergedConfig.uiLanguage);
        const nextCopy = getTranslations(nextLanguage);
        const customSizeDraft = getCustomSizeDraft(mergedConfig.defaultSize);

        if (!isMounted) {
          return;
        }

        setRuntime(adapter);
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

  useEffect(() => {
    const availableIds = new Set(history.map((record) => record.id));

    setSelectedHistoryIds((current) => {
      const next = new Set(Array.from(current).filter((id) => availableIds.has(id)));
      return next.size === current.size ? current : next;
    });

    if (selectedHistoryId && !availableIds.has(selectedHistoryId)) {
      setSelectedHistoryId(history[0]?.id ?? null);
    }
  }, [history, selectedHistoryId]);

  async function reloadHistory(adapter: RuntimeAdapter) {
    const loadedHistory = await adapter.loadHistory();
    setHistory(loadedHistory);
    return loadedHistory;
  }

  function updateConfig<K extends keyof AppConfig>(key: K, value: AppConfig[K]) {
    setConfig((current) => ({ ...current, [key]: value }));
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

  async function persistConfig(nextConfig: AppConfig, failureMessage: (detail: string) => string): Promise<boolean> {
    if (!runtime) {
      setAppMessage(copy.messages.runtimeUnavailable);
      return false;
    }

    try {
      await runtime.saveConfig(nextConfig);
      setConfig(nextConfig);
      setPersistedConfig(nextConfig);
      return true;
    } catch (error) {
      setAppMessage(failureMessage(getErrorMessage(error)));
      return false;
    }
  }

  function requireValidConfig(actionLabel: string): boolean {
    const nextValidation = validateConfig(config);
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

  function getPromptTemplateTitle(template: PromptTemplate): string {
    return template.source === "built-in" ? (copy.promptTemplates[template.id] ?? template.title) : template.title;
  }

  async function handleApplyPromptTemplate(template: PromptTemplate) {
    handlePromptChange(template.prompt);
    setAppMessage(copy.messages.promptTemplateApplied(getPromptTemplateTitle(template)));
  }

  async function handleSaveCurrentPromptAsTemplate() {
    const templatePrompt = effectivePrompt.trim();

    if (!templatePrompt) {
      setAppMessage(copy.messages.promptTemplatePromptRequired);
      return;
    }

    let template: PromptTemplate;
    try {
      template = createCustomPromptTemplate({
        title: customTemplateTitle,
        prompt: templatePrompt,
        category: customTemplateCategory,
        fallbackTitle: copy.messages.promptTemplateUntitled,
      });
    } catch (error) {
      setAppMessage(getErrorMessage(error));
      return;
    }

    const nextConfig = mergeConfig({
      ...config,
      customPromptTemplates: [template, ...config.customPromptTemplates],
    });
    const saved = await persistConfig(nextConfig, copy.messages.promptTemplateSaveFailed);

    if (saved) {
      setCustomTemplateTitle("");
      setTemplateCategory(template.category);
      setAppMessage(copy.messages.promptTemplateSaved(template.title));
    }
  }

  async function handleDeleteCustomPromptTemplate(template: PromptTemplate) {
    if (template.source !== "custom") {
      return;
    }

    const nextConfig = mergeConfig({
      ...config,
      customPromptTemplates: removeCustomPromptTemplate(config.customPromptTemplates, template.id),
    });
    const saved = await persistConfig(nextConfig, copy.messages.promptTemplateDeleteFailed);

    if (saved) {
      setAppMessage(copy.messages.promptTemplateRemoved(template.title));
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

  function handleFormatChange(nextValue: AppConfig["defaultFormat"]) {
    updateConfig("defaultFormat", nextValue);
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
      const revisedPrompt = await optimizePrompt(config, nextPrompt);

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

      setAppMessage(copy.messages.optimizationFailed(getApiErrorMessage(error, language)));
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
      setPreviewState({
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
    setPreviewState({ status: "running", startedAt, prompt: finalPrompt });

    try {
      const generatedImages = await generateImages(
        config,
        finalPrompt,
        generationMode === "image-to-image" && referenceImages.length > 0
          ? { referenceImages: referenceImages.map((item) => item.file) }
          : undefined,
      );
      const firstImage = generatedImages[0];

      if (!firstImage) {
        throw new Error("Image generation response did not contain any image data.");
      }

      const generatedAt = new Date();
      const durationMs = Date.now() - startedAt;
      const savedResult = await runtime.saveImage({
        image: firstImage,
        prompt: sourcePrompt,
        optimizedPrompt: optimizedPrompt.trim(),
        customName: customName.trim(),
        config,
        generatedAt,
        durationMs,
      });

      await reloadHistory(runtime);
      setSelectedHistoryId(savedResult.record.id);
      setPreviewState({
        status: "success",
        prompt: sourcePrompt,
        optimizedPrompt: optimizedPrompt.trim(),
        imageUrl: savedResult.previewUrl,
        record: savedResult.record,
        customName: customName.trim(),
        source: "generated",
      });
    } catch (error) {
      setPreviewState({
        status: "failed",
        prompt: finalPrompt,
        message: getApiErrorMessage(error, language),
        durationMs: Date.now() - startedAt,
      });
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSaveSettings() {
    if (!runtime) {
      return;
    }

    setIsSavingSettings(true);

    try {
      await runtime.saveConfig(config);
      setPersistedConfig(config);
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
        updateConfig("outputDirectory", selectedDirectory);
        setSettingsMessage({
          tone: "neutral",
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
      const response = await testTextModel(config);
      setSettingsMessage({
        tone: "success",
        text: copy.messages.textTestSuccess(response.trim().slice(0, 120) || "OK"),
      });
    } catch (error) {
      setSettingsMessage({
        tone: "error",
        text: copy.messages.textTestFailed(getApiErrorMessage(error, language)),
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
      const images = await testImageModel(config);
      setSettingsMessage({
        tone: "success",
        text: copy.messages.imageTestSuccess(images.length),
      });
    } catch (error) {
      setSettingsMessage({
        tone: "error",
        text: copy.messages.imageTestFailed(getApiErrorMessage(error, language)),
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
      const images = await testImageEditModel(config);
      setSettingsMessage({
        tone: "success",
        text: copy.messages.imageEditTestSuccess(images.length),
      });
    } catch (error) {
      setSettingsMessage({
        tone: "error",
        text: copy.messages.imageEditTestFailed(getApiErrorMessage(error, language)),
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

  async function handleOpenOutputDirectory() {
    if (!runtime) {
      setSettingsMessage({ tone: "error", text: copy.messages.runtimeUnavailable });
      return;
    }

    if (runtime.mode !== "desktop") {
      setSettingsMessage({ tone: "neutral", text: copy.messages.openOutputDirectoryUnavailableWeb });
      return;
    }

    try {
      await runtime.openOutputDirectory(config);
      setSettingsMessage({ tone: "success", text: copy.messages.openOutputDirectoryOpened });
    } catch (error) {
      setSettingsMessage({ tone: "error", text: copy.messages.openOutputFailed(getErrorMessage(error)) });
    }
  }

  function handleToggleHistorySelection(id: string, checked: boolean) {
    setSelectedHistoryIds((current) => {
      const next = new Set(current);

      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }

      return next;
    });
  }

  function handleSelectVisibleHistory() {
    if (filteredHistory.length === 0) {
      return;
    }

    setSelectedHistoryIds(new Set(filteredHistory.map((record) => record.id)));
    setAppMessage(copy.messages.historySelected(filteredHistory.length));
  }

  function handleClearHistorySelection() {
    setSelectedHistoryIds(new Set());
    setAppMessage(copy.messages.historySelectionCleared);
  }

  async function handleDeleteSelectedHistory() {
    if (!runtime) {
      setAppMessage(copy.messages.runtimeUnavailable);
      return;
    }

    const ids = Array.from(selectedHistoryIds);
    if (ids.length === 0) {
      return;
    }

    setIsDeletingHistory(true);

    try {
      const remainingHistory = await runtime.deleteHistoryRecords(ids);
      const removedIds = new Set(ids);

      setHistory(remainingHistory);
      setSelectedHistoryIds(new Set());

      if (selectedHistoryId && removedIds.has(selectedHistoryId)) {
        setSelectedHistoryId(remainingHistory[0]?.id ?? null);
      }

      setPreviewState((current) => {
        if (
          (current.status === "success" || current.status === "history-unavailable") &&
          removedIds.has(current.record.id)
        ) {
          return { status: "idle" };
        }

        return current;
      });
      setAppMessage(copy.messages.historyDeleted(ids.length));
    } catch (error) {
      setAppMessage(copy.messages.historyDeleteFailed(getErrorMessage(error)));
    } finally {
      setIsDeletingHistory(false);
    }
  }

  async function handleInspectHistory(record: ImageRecord) {
    setSelectedHistoryId(record.id);

    if (!runtime) {
      return;
    }

    try {
      if (runtime.mode === "desktop") {
        const { convertFileSrc } = await import("@tauri-apps/api/core");
        setPreviewState({
          status: "success",
          prompt: record.prompt,
          optimizedPrompt: record.optimizedPrompt,
          imageUrl: convertFileSrc(record.outputPath),
          record,
          customName: "",
          source: "history",
        });
        return;
      }

      setPreviewState({
        status: "history-unavailable",
        record,
        message: copy.notes.webHistoryUnavailable,
      });
    } catch (error) {
      setPreviewState({
        status: "history-unavailable",
        record,
        message: copy.messages.historyPreviewPreparationFailed(getErrorMessage(error)),
      });
    }
  }

  function handlePreviewImageError(successState: Extract<PreviewState, { status: "success" }>) {
    if (successState.source === "history") {
      setPreviewState({
        status: "history-unavailable",
        record: successState.record,
        message: copy.messages.historyPreviewUnavailable,
      });
      return;
    }

    setPreviewState({
      status: "failed",
      prompt: successState.prompt,
      message: copy.messages.generatedPreviewLoadFailed,
      durationMs: successState.record.durationMs,
    });
  }

  const modeLabel = generationMode === "image-to-image" ? copy.modes.imageToImage : copy.modes.textToImage;
  const outputDirectoryLabel = config.outputDirectory || "outputs";

  return (
    <>
      <main className={`app-shell ${activeTab === "history" ? "history-focus" : ""}`}>
        <header className="app-header">
          <div className="hero-copy">
            <p className="eyebrow">{copy.app.eyebrow}</p>
            <h1>{copy.app.title}</h1>
            <p className="app-subtitle">{copy.app.subtitle}</p>
          </div>

          <div className="header-stack">
            <div className="language-card">
              <span>{copy.app.languageLabel}</span>
              <div className="language-switch" role="tablist" aria-label={copy.app.languageLabel}>
                {([
                  ["zh-CN", copy.app.languageChinese],
                  ["en-US", copy.app.languageEnglish],
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
                  {activeTab === "history" && copy.panel.historyToolsTitle}
                  {activeTab === "settings" && copy.panel.settingsTitle}
                </h2>
                <p>
                  {activeTab === "generate" && copy.panel.generateDescription}
                  {activeTab === "history" && copy.panel.historyToolsDescription}
                  {activeTab === "settings" && copy.panel.settingsDescription}
                </p>
              </div>
            </header>

            {activeTab === "generate" ? (
              <div className="panel-body form-stack">
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

                {generationMode === "image-to-image" ? (
                  <section className="reference-section">
                    <div className="section-heading">
                      <h3>{copy.fields.referenceImage}</h3>
                      <p>{copy.notes.imageToImageModeDescription}</p>
                    </div>

                    <input
                      ref={referenceInputRef}
                      type="file"
                      accept="image/*"
                      multiple
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
                        <p>{copy.notes.referenceImageLimitHint}</p>
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
                      <span>{copy.notes.referenceImageHint}</span>
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

                <section className="prompt-template-section">
                  <div className="section-heading">
                    <h3>{copy.cards.promptTemplateLibrary}</h3>
                    <p>{copy.notes.promptTemplateLibraryDescription}</p>
                  </div>

                  <div className="template-filter-grid">
                    <label className="field">
                      <span>{copy.fields.templateSearch}</span>
                      <input
                        value={templateQuery}
                        onChange={(event) => setTemplateQuery(event.target.value)}
                        placeholder={copy.fields.templateSearchPlaceholder}
                      />
                    </label>
                    <label className="field">
                      <span>{copy.fields.templateCategory}</span>
                      <select
                        value={templateCategory}
                        onChange={(event) => setTemplateCategory(event.target.value as PromptTemplateCategory | "all")}
                      >
                        <option value="all">{promptTemplateCategoryLabels.all}</option>
                        {promptTemplateCategories.map((category) => (
                          <option key={category} value={category}>
                            {promptTemplateCategoryLabels[category]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {filteredPromptTemplates.length === 0 ? (
                    <p className="empty-state">{copy.empty.noPromptTemplates}</p>
                  ) : (
                    <div className="prompt-template-grid">
                      {filteredPromptTemplates.map((template) => (
                        <article key={template.id} className="prompt-template-card">
                          <div className="template-card-head">
                            <span>{promptTemplateCategoryLabels[template.category]}</span>
                            <strong>{getPromptTemplateTitle(template)}</strong>
                          </div>
                          <p>{template.prompt}</p>
                          <div className="action-row">
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => void handleApplyPromptTemplate(template)}
                            >
                              {copy.actions.applyTemplate}
                            </button>
                            {template.source === "custom" ? (
                              <button
                                type="button"
                                className="ghost-button danger-button"
                                onClick={() => void handleDeleteCustomPromptTemplate(template)}
                              >
                                {copy.actions.deleteTemplate}
                              </button>
                            ) : null}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}

                  <div className="custom-template-card">
                    <div className="section-heading">
                      <h3>{copy.cards.customPromptTemplate}</h3>
                      <p>{copy.notes.customPromptTemplateDescription}</p>
                    </div>
                    <div className="template-filter-grid">
                      <label className="field">
                        <span>{copy.fields.templateTitle}</span>
                        <input
                          value={customTemplateTitle}
                          onChange={(event) => setCustomTemplateTitle(event.target.value)}
                          placeholder={copy.fields.templateTitlePlaceholder}
                        />
                      </label>
                      <label className="field">
                        <span>{copy.fields.templateCategory}</span>
                        <select
                          value={customTemplateCategory}
                          onChange={(event) => setCustomTemplateCategory(event.target.value as PromptTemplateCategory)}
                        >
                          {(["portrait", "product", "social", "style", "custom"] as const).map((category) => (
                            <option key={category} value={category}>
                              {promptTemplateCategoryLabels[category]}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <button type="button" className="secondary-button" onClick={handleSaveCurrentPromptAsTemplate}>
                      {copy.actions.savePromptTemplate}
                    </button>
                  </div>
                </section>

                <label className="field">
                  <span>{copy.fields.prompt}</span>
                  <textarea
                    value={prompt}
                    onChange={(event) => handlePromptChange(event.target.value)}
                    rows={8}
                    placeholder={copy.fields.promptPlaceholder}
                  />
                </label>

                <div className="field-grid">
                  <label className="field">
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

            {activeTab === "history" ? (
              <div className="panel-body form-stack">
                <div className="stats-grid">
                  <div className="stat-card">
                    <span>{copy.cards.totalRecords}</span>
                    <strong>{history.length}</strong>
                  </div>
                  <div className="stat-card">
                    <span>{copy.cards.filteredRecords}</span>
                    <strong>{filteredHistory.length}</strong>
                  </div>
                  <div className="stat-card">
                    <span>{copy.cards.dateGroups}</span>
                    <strong>{historyGroups.length}</strong>
                  </div>
                  <div className="stat-card">
                    <span>{copy.cards.selectedRecords}</span>
                    <strong>{selectedHistoryCount}</strong>
                  </div>
                </div>

                <section className="history-filter-card">
                  <div className="section-heading">
                    <h3>{copy.cards.historyFilters}</h3>
                    <p>{copy.notes.historyFilterDescription}</p>
                  </div>
                  <div className="template-filter-grid">
                    <label className="field">
                      <span>{copy.fields.historySearch}</span>
                      <input
                        value={historyQuery}
                        onChange={(event) => setHistoryQuery(event.target.value)}
                        placeholder={copy.fields.historySearchPlaceholder}
                      />
                    </label>
                    <label className="field">
                      <span>{copy.fields.historyStatus}</span>
                      <select
                        value={historyStatusFilter}
                        onChange={(event) => setHistoryStatusFilter(event.target.value as HistoryStatusFilter)}
                      >
                        {(["all", "success", "failed", "cancelled"] as const).map((status) => (
                          <option key={status} value={status}>
                            {historyStatusLabels[status]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="history-batch-actions">
                    <span>{copy.messages.historySelectionSummary(selectedHistoryCount, filteredHistory.length)}</span>
                    <div className="action-row">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={handleSelectVisibleHistory}
                        disabled={filteredHistory.length === 0}
                      >
                        {copy.actions.selectVisible}
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={handleClearHistorySelection}
                        disabled={selectedHistoryCount === 0}
                      >
                        {copy.actions.clearSelection}
                      </button>
                      <button
                        type="button"
                        className="secondary-button danger-button"
                        onClick={() => void handleDeleteSelectedHistory()}
                        disabled={selectedHistoryCount === 0 || isDeletingHistory || !runtime}
                      >
                        {isDeletingHistory ? copy.actions.deleteSelectedBusy : copy.actions.deleteSelected}
                      </button>
                    </div>
                  </div>
                </section>

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
                    <h3>{copy.sections.connection}</h3>
                    <p>{copy.panel.settingsDescription}</p>
                  </div>
                  <div className="field-grid">
                    <label className="field">
                      <span>{copy.fields.baseUrl}</span>
                      <input
                        value={config.baseUrl}
                        onChange={(event) => updateConfig("baseUrl", event.target.value)}
                        placeholder="https://example.com/v1"
                      />
                    </label>

                    <label className="field">
                      <span>{copy.fields.apiKey}</span>
                      <input
                        value={config.apiKey}
                        onChange={(event) => updateConfig("apiKey", event.target.value)}
                        placeholder="sk-..."
                        type="password"
                        autoComplete="off"
                      />
                    </label>
                  </div>

                  <div className="field-grid">
                    <label className="field">
                      <span>{copy.fields.textModel}</span>
                      <input
                        value={config.textModel}
                        onChange={(event) => updateConfig("textModel", event.target.value)}
                      />
                    </label>

                    <label className="field">
                      <span>{copy.fields.imageModel}</span>
                      <input
                        value={config.imageModel}
                        onChange={(event) => updateConfig("imageModel", event.target.value)}
                      />
                    </label>
                  </div>
                </section>

                <section className="settings-section">
                  <div className="section-heading">
                    <h3>{copy.sections.defaults}</h3>
                    <p>{copy.notes.defaultsDescription}</p>
                  </div>

                  <div className="field-grid">
                    <label className="field">
                      <span>{copy.fields.timeoutSeconds}</span>
                      <input
                        type="number"
                        min={180}
                        step={1}
                        value={config.timeoutSeconds}
                        onChange={(event) => updateConfig("timeoutSeconds", Number(event.target.value) || 0)}
                      />
                    </label>

                    <label className="field">
                      <span>{copy.fields.imageCount}</span>
                      <input
                        type="number"
                        min={1}
                        max={4}
                        step={1}
                        value={config.defaultCount}
                        onChange={(event) => updateConfig("defaultCount", Number(event.target.value) || 0)}
                      />
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

                  <p className="panel-note">{copy.notes.sizeConstraintsHint}</p>
                  {sizeMode === "custom" ? <p className="panel-note">{copy.notes.customSizeHint}</p> : null}
                  {sizeValidation.warning ? (
                    <p className="panel-note highlight-note">
                      {copy.validation[sizeValidation.warning] ?? sizeValidation.warning}
                    </p>
                  ) : null}
                  {showCompressionControls ? <p className="panel-note">{copy.notes.compressionHint}</p> : null}
                </section>

                <section className="settings-section">
                  <div className="section-heading">
                    <h3>{copy.sections.output}</h3>
                    <p>{copy.notes.outputDescription}</p>
                  </div>

                  <div className="field-grid single-column">
                    <label className="field">
                      <span>{copy.fields.outputDirectory}</span>
                      <input
                        value={config.outputDirectory}
                        onChange={(event) => updateConfig("outputDirectory", event.target.value)}
                      />
                    </label>
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
                      onClick={() => void handleOpenOutputDirectory()}
                      disabled={!runtime}
                    >
                      {copy.actions.openOutputDirectory}
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
                      onClick={handleSaveSettings}
                      disabled={isSavingSettings || !runtime}
                    >
                      {isSavingSettings ? copy.actions.saveBusy : copy.actions.save}
                    </button>
                  </div>

                  <p className="panel-note">{copy.notes.imageEditTestDescription}</p>
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
                      <dt>{copy.app.statusLabel}</dt>
                      <dd>{formatMode(runtime?.mode ?? null, language)}</dd>
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
                  </div>
                </section>

                {settingsMessage.text ? (
                  <div className={`message-card ${settingsMessage.tone}`}>{settingsMessage.text}</div>
                ) : null}

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
                  {previewState.status === "running"
                    ? copy.panel.previewRunningDescription
                    : copy.panel.previewIdleDescription}
                </p>
              </div>
              {previewState.status === "running" ? <div className="timer-pill">{formatDuration(elapsedMs)}</div> : null}
            </header>

            <div className="panel-body preview-body">
              {isLoadingApp ? <p className="empty-state">{copy.empty.loadingRuntime}</p> : null}

              {!isLoadingApp && previewState.status === "idle" ? (
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
                          <dd>{historyStatusLabels[selectedRecord.status]}</dd>
                        </div>
                      </dl>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {previewState.status === "running" ? (
                <div className="preview-state">
                  <div className="preview-placeholder running">{copy.preview.running}</div>
                  <p>{previewState.prompt}</p>
                  <p className="panel-note">{copy.preview.runningHint}</p>
                </div>
              ) : null}

              {previewState.status === "failed" ? (
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

              {previewState.status === "history-unavailable" ? (
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
                  <p className="panel-note">{previewState.message}</p>
                </div>
              ) : null}

              {previewState.status === "success" ? (
                <div className="preview-success">
                  <div className="preview-frame">
                    <img
                      src={previewState.imageUrl}
                      alt={previewState.prompt}
                      onError={() => handlePreviewImageError(previewState)}
                    />
                  </div>
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
                    </dl>
                    <p>{previewState.optimizedPrompt || previewState.prompt}</p>
                    <div className="action-row">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => handleReusePrompt(previewState.record)}
                      >
                        {copy.actions.reusePrompt}
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
              <div className="history-count">{filteredHistory.length}/{history.length}</div>
            </header>

            <div className="panel-body history-body">
              <div className="history-toolbar">
                <label className="field">
                  <span>{copy.fields.historySearch}</span>
                  <input
                    value={historyQuery}
                    onChange={(event) => setHistoryQuery(event.target.value)}
                    placeholder={copy.fields.historySearchPlaceholder}
                  />
                </label>
                <label className="field">
                  <span>{copy.fields.historyStatus}</span>
                  <select
                    value={historyStatusFilter}
                    onChange={(event) => setHistoryStatusFilter(event.target.value as HistoryStatusFilter)}
                  >
                    {(["all", "success", "failed", "cancelled"] as const).map((status) => (
                      <option key={status} value={status}>
                        {historyStatusLabels[status]}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="history-batch-actions compact">
                  <span>{copy.messages.historySelectionSummary(selectedHistoryCount, filteredHistory.length)}</span>
                  <div className="action-row">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={handleSelectVisibleHistory}
                      disabled={filteredHistory.length === 0}
                    >
                      {copy.actions.selectVisible}
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={handleClearHistorySelection}
                      disabled={selectedHistoryCount === 0}
                    >
                      {copy.actions.clearSelection}
                    </button>
                    <button
                      type="button"
                      className="ghost-button danger-button"
                      onClick={() => void handleDeleteSelectedHistory()}
                      disabled={selectedHistoryCount === 0 || isDeletingHistory || !runtime}
                    >
                      {isDeletingHistory ? copy.actions.deleteSelectedBusy : copy.actions.deleteSelected}
                    </button>
                  </div>
                </div>
              </div>

              {history.length === 0 ? (
                <p className="empty-state">{copy.empty.noHistorySaved}</p>
              ) : historyGroups.length === 0 ? (
                <p className="empty-state">{copy.empty.noHistoryMatches}</p>
              ) : (
                historyGroups.map((group) => (
                  <section key={group.date} className="history-group">
                    <div className="history-group-header">
                      <h3>{group.date}</h3>
                      <span>{group.records.length}</span>
                    </div>

                    <div className="history-list">
                      {group.records.map((record) => (
                        <article
                          key={record.id}
                          className={`history-item ${record.id === selectedHistoryId ? "selected" : ""}`}
                        >
                          <div className="history-item-head">
                            <label className="history-select">
                              <input
                                type="checkbox"
                                checked={selectedHistoryIds.has(record.id)}
                                aria-label={`${copy.actions.selectRecord}: ${record.prompt}`}
                                onChange={(event) => handleToggleHistorySelection(record.id, event.target.checked)}
                              />
                              <span className={`status-pill ${record.status}`}>{historyStatusLabels[record.status]}</span>
                            </label>
                            <time dateTime={record.createdAt}>{formatDateTime(record.createdAt, language)}</time>
                          </div>
                          <p className="history-prompt">{record.optimizedPrompt || record.prompt}</p>
                          <dl className="history-meta">
                            <div>
                              <dt>{copy.labels.model}</dt>
                              <dd>{record.model}</dd>
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
                      ))}
                    </div>
                  </section>
                ))
              )}
            </div>
          </section>
        </section>

        <button type="button" className="support-fab" onClick={() => setIsSupportOpen(true)}>
          {copy.support.trigger}
        </button>
      </main>

      <Dialog
        open={showWelcome}
        title={copy.welcome.title}
        onClose={() => void handleDismissWelcome()}
        size="wide"
        footer={
          <>
            <button type="button" className="secondary-button" onClick={() => void handleDismissWelcome()}>
              {copy.actions.skip}
            </button>
            <button type="button" className="primary-button" onClick={() => void handleDismissWelcome()}>
              {copy.actions.startUsing}
            </button>
          </>
        }
      >
        <div className="welcome-grid">
          <section className="welcome-card">
            <span className="card-tag">{copy.cards.welcomeIntro}</span>
            <h3>{copy.welcome.title}</h3>
            <p>{copy.welcome.intro}</p>
          </section>

          <section className="welcome-card highlight">
            <span className="card-tag">{copy.cards.welcomeRecommended}</span>
            <h3>{copy.welcome.recommendedTitle}</h3>
            <p>{copy.welcome.recommendedBody}</p>
            <button
              type="button"
              className="secondary-button inline-button"
              onClick={() => void handleOpenRecommendedRelay()}
            >
              {copy.actions.openRecommended}
            </button>
          </section>

          <section className="welcome-card">
            <span className="card-tag">{copy.cards.welcomeQuickStart}</span>
            <h3>{copy.welcome.quickStartTitle}</h3>
            <p>{copy.welcome.quickStartBody}</p>
          </section>
        </div>
      </Dialog>

      <Dialog
        open={isSupportOpen}
        title={copy.support.modalTitle}
        onClose={() => setIsSupportOpen(false)}
        footer={
          <button type="button" className="primary-button" onClick={() => setIsSupportOpen(false)}>
            {copy.actions.close}
          </button>
        }
      >
        <div className="support-modal">
          <p className="support-copy">{copy.support.body}</p>
          <div className="support-qr-card">
            <img
              src={paymentQrCode}
              alt={copy.support.zoomTitle}
              className="support-qr"
              onClick={() => setIsQrZoomed(true)}
            />
            <div>
              <strong>{copy.cards.supportRecommendation}</strong>
              <p>{copy.cards.supportZoomHint}</p>
            </div>
          </div>
        </div>
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

      <Dialog
        open={isQrZoomed}
        title={copy.support.zoomTitle}
        onClose={() => setIsQrZoomed(false)}
        className="zoom-dialog"
      >
        <div className="zoom-view">
          <img src={paymentQrCode} alt={copy.support.zoomTitle} className="zoom-image" />
        </div>
      </Dialog>
    </>
  );
}
