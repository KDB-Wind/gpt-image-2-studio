import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";

import type { BatchImageSaveInput, BatchImageSaveResult, BatchManifest } from "../core/batchTypes";
import type { AppConfig } from "../core/config";
import type { ImageRecord } from "../core/history";
import type { RuntimeAdapter, SaveImageInput, SaveImageResult } from "./types";

type SaveGeneratedImagePayload = {
  imageBase64: string;
  prompt: string;
  optimizedPrompt: string;
  customName: string;
  config: AppConfig;
  generatedAt: string;
  durationMs: number;
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

  if (input.image.url) {
    const response = await fetch(input.image.url);

    if (!response.ok) {
      throw new Error(`Failed to download generated image: HTTP ${response.status}.`);
    }

    return blobToBase64(await response.blob());
  }

  throw new Error("Image payload did not include base64 data or a URL.");
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
  };
}

async function createBatchImagePayload(input: BatchImageSaveInput) {
  return {
    batchId: input.batchId,
    batchTitle: input.batchTitle,
    batchCreatedAt: input.batchCreatedAt,
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
  };
}

export const tauriAdapter: RuntimeAdapter = {
  mode: "desktop",

  loadConfig() {
    return invoke<AppConfig>("load_config");
  },

  saveConfig(config: AppConfig) {
    return invoke<void>("save_config", { config });
  },

  loadHistory() {
    return invoke<ImageRecord[]>("load_history");
  },

  deleteHistoryRecords(recordIds: string[]) {
    return invoke<ImageRecord[]>("delete_history_records", { recordIds });
  },

  async prepareHistoryPreview(record: ImageRecord) {
    return convertFileSrc(record.outputPath);
  },

  async prepareHistoryFile(record: ImageRecord) {
    try {
      const response = await fetch(convertFileSrc(record.outputPath));

      if (!response.ok) {
        return null;
      }

      const blob = await response.blob();
      return new File([blob], getFileNameFromPath(record.outputPath), { type: blob.type || "image/png" });
    } catch {
      return null;
    }
  },

  async testOutputDirectory() {
    return {
      ok: true,
      message: "Desktop runtime saves and opens files through native file access.",
    };
  },

  async saveImage(input: SaveImageInput): Promise<SaveImageResult> {
    const result = await invoke<SaveImageResult>("save_generated_image", {
      input: await createPayload(input),
    });

    return {
      ...result,
      previewUrl: convertFileSrc(result.record.outputPath),
    };
  },

  async saveBatchImage(input: BatchImageSaveInput): Promise<BatchImageSaveResult> {
    const result = await invoke<BatchImageSaveResult>("save_batch_image", {
      input: await createBatchImagePayload(input),
    });

    return {
      ...result,
      previewUrl: convertFileSrc(result.record.outputPath),
      outputPath: result.record.outputPath,
    };
  },

  async saveBatchManifest(manifest: BatchManifest): Promise<string> {
    return invoke<string>("save_batch_manifest", { manifest });
  },

  async chooseOutputDirectory() {
    const selected = await open({ directory: true, multiple: false });

    return typeof selected === "string" ? selected : null;
  },

  async openOutputPath(path: string) {
    await openPath(path);
  },
};

function getFileNameFromPath(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() || "history-image.png";
}
