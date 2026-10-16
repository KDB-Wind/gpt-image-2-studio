import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import { sanitizeBatchManifest } from "../core/batchManifest";
import { safeErrorMessage } from "../core/errorSanitizer";
import { resolveImageBlob } from "../core/imagePayload";
import type { BatchImageSaveInput, BatchImageSaveResult, BatchManifest } from "../core/batchTypes";
import { mergeConfig, type AppConfig } from "../core/config";
import { resolveActiveProviderProfile } from "../core/providerProfiles";
import type { ImageRecord } from "../core/history";
import type { ProviderProfileSnapshot } from "../core/history";
import type { ProviderProfileMetadata } from "../core/providerProfiles";
import type {
  OutputDirectoryState,
  OutputDirectoryTestResult,
  RuntimeAdapter,
  SaveImageInput,
  SaveImageResult,
} from "./types";

type SaveGeneratedImagePayload = {
  imageBase64: string;
  prompt: string;
  optimizedPrompt: string;
  customName: string;
  config: AppConfig;
  generatedAt: string;
  durationMs: number;
  providerProfileSnapshot?: ProviderProfileSnapshot;
};

async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read blob."));
    reader.readAsDataURL(blob);
  });
  const [, base64 = ""] = dataUrl.split(",", 2);

  if (!base64) {
    throw new Error("Failed to convert image blob to base64.");
  }

  return base64;
}

async function imageToBase64(input: SaveImageInput): Promise<string> {
  if (input.image.base64) {
    return input.image.base64;
  }

  return blobToBase64(await resolveImageBlob(input.image, input.config));
}

async function batchImageToBase64(input: BatchImageSaveInput): Promise<string> {
  return imageToBase64({
    image: input.image,
    prompt: input.task.prompt,
    optimizedPrompt: "",
    customName: "",
    config: input.config,
    generatedAt: input.generatedAt,
    durationMs: input.durationMs,
    providerProfileSnapshot: input.providerProfileSnapshot,
  });
}

async function createPayload(input: SaveImageInput): Promise<SaveGeneratedImagePayload> {
  return {
    imageBase64: await imageToBase64(input),
    prompt: input.prompt,
    optimizedPrompt: input.optimizedPrompt,
    customName: input.customName,
    config: input.config,
    generatedAt: input.generatedAt.toISOString(),
    durationMs: input.durationMs,
    providerProfileSnapshot: input.providerProfileSnapshot,
  };
}

async function createBatchImagePayload(input: BatchImageSaveInput) {
  return {
    batchId: input.batchId,
    batchTitle: input.batchTitle,
    batchCreatedAt: input.batchCreatedAt,
    totalTasks: input.totalTasks,
    task: {
      id: input.task.id,
      index: input.task.index,
      title: input.task.title,
      prompt: input.task.prompt,
    },
    imageBase64: await batchImageToBase64(input),
    config: input.config,
    generatedAt: input.generatedAt.toISOString(),
    durationMs: input.durationMs,
    providerProfileSnapshot: input.providerProfileSnapshot,
  };
}

export const tauriAdapter: RuntimeAdapter = {
  mode: "desktop",

  loadConfig() {
    return invoke<AppConfig>("load_config").then((config) => {
      const activeProfile = config.providerProfiles.find((profile) => profile.id === config.activeProviderProfileId);
      const rememberApiKey = activeProfile?.rememberApiKey ?? config.rememberApiKey;
      const apiKey = rememberApiKey ? config.apiKey : "";
      const providerProfiles = config.providerProfiles.map((profile) => ({
        ...profile,
        apiKey: profile.id === config.activeProviderProfileId ? apiKey : "",
      }));
      return mergeConfig({ ...config, apiKey, rememberApiKey, providerProfiles });
    });
  },

  loadProviderApiKey(profileId: string) {
    return invoke<string>("load_provider_api_key", { profileId });
  },

  clearProviderApiKey(profileId: string) {
    return invoke<void>("clear_provider_api_key", { profileId });
  },

  async saveConfig(config: AppConfig) {
    const activeProfile = resolveActiveProviderProfile(config.providerProfiles, config.activeProviderProfileId);
    const activeProfileApiKey = activeProfile.rememberApiKey ? activeProfile.apiKey : "";
    const providerProfiles: ProviderProfileMetadata[] = config.providerProfiles.map(({ apiKey: _apiKey, ...profile }) => profile);
    const { apiKey: _apiKey, ...configWithoutApiKey } = config;
    const bridgeConfig = {
      ...configWithoutApiKey,
      baseUrl: activeProfile.baseUrl,
      textModel: activeProfile.textModel,
      imageModel: activeProfile.imageModel,
      imageResponseMode: activeProfile.imageResponseMode,
      rememberApiKey: activeProfile.rememberApiKey,
      providerProfiles,
    };
    return invoke<void>("save_config", {
      input: { config: bridgeConfig, activeProfileApiKey },
    });
  },

  loadHistory() {
    return invoke<ImageRecord[]>("load_history");
  },

  deleteHistoryRecords(recordIds: string[]) {
    return invoke<ImageRecord[]>("delete_history_records", { recordIds });
  },

  async prepareHistoryPreview(record: ImageRecord) {
    return invoke<string>("read_saved_image", { recordId: record.id });
  },

  async prepareHistoryFile(record: ImageRecord) {
    try {
      const dataUrl = await invoke<string>("read_saved_image", { recordId: record.id });
      const response = await fetch(dataUrl);

      if (!response.ok) {
        return null;
      }

      const blob = await response.blob();
      return new File([blob], getFileNameFromPath(record.outputPath), { type: blob.type || "image/png" });
    } catch {
      return null;
    }
  },

  async testOutputDirectory(): Promise<OutputDirectoryTestResult> {
    try {
      const config = await invoke<AppConfig>("load_config");
      return await invoke<OutputDirectoryTestResult>("test_output_directory", {
        outputDirectory: config.outputDirectory,
      });
    } catch (error) {
      return {
        ok: false,
        message: safeErrorMessage(error),
      };
    }
  },

  async getOutputDirectoryState(): Promise<OutputDirectoryState> {
    try {
      return await invoke<OutputDirectoryState>("get_output_directory_state");
    } catch {
      try {
        const config = await invoke<AppConfig>("load_config");
        return { status: "permission-required", name: config.outputDirectory || "outputs" };
      } catch {
        return { status: "not-authorized" };
      }
    }
  },

  async saveImage(input: SaveImageInput): Promise<SaveImageResult> {
    const payload = await createPayload(input);
    const result = await invoke<SaveImageResult>("save_generated_image", {
      input: payload,
    });

    return {
      ...result,
      previewUrl: imagePreviewUrl(payload.imageBase64, input.config.defaultFormat),
      saveMode: result.saveMode ?? "authorized-directory",
      historyDurability: result.historyDurability ?? "persistent",
    };
  },

  async saveBatchImage(input: BatchImageSaveInput): Promise<BatchImageSaveResult> {
    const payload = await createBatchImagePayload(input);
    const result = await invoke<BatchImageSaveResult>("save_batch_image", {
      input: payload,
    });

    return {
      ...result,
      previewUrl: imagePreviewUrl(payload.imageBase64, input.config.defaultFormat),
      outputPath: result.record.outputPath,
      saveMode: result.saveMode ?? "authorized-directory",
      historyDurability: result.historyDurability ?? "persistent",
    };
  },

  async saveBatchManifest(manifest: BatchManifest): Promise<string> {
    return invoke<string>("save_batch_manifest", { manifest: sanitizeBatchManifest(manifest) });
  },

  async chooseOutputDirectory() {
    const selected = await open({ directory: true, multiple: false });

    return typeof selected === "string" ? selected : null;
  },

  async openOutputPath(path: string) {
    await invoke<void>("open_saved_image", { outputPath: path });
  },
};

function imagePreviewUrl(base64: string, format: string): string {
  const mime = format === "jpeg" || format === "jpg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png";
  return `data:${mime};base64,${base64}`;
}

function getFileNameFromPath(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() || "history-image.png";
}
