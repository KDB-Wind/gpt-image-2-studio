import { DEFAULT_CONFIG, mergeConfig, type AppConfig } from "../core/config";
import { buildBatchDirectoryName, buildBatchImageFileName } from "../core/batchManifest";
import type { BatchImageSaveInput, BatchImageSaveResult, BatchManifest } from "../core/batchTypes";
import { buildImageFileName, buildOutputPath, formatDateFolder } from "../core/fileNames";
import { sortHistoryNewestFirst, type ImageRecord } from "../core/history";
import type { RuntimeAdapter, SaveImageInput, SaveImageResult } from "./types";

const CONFIG_KEY = "chat-to-image.config.v1";
const HISTORY_KEY = "chat-to-image.history.v1";

let directoryHandle: FileSystemDirectoryHandle | null = null;

function readStoredValue<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);

  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStoredValue(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

function decodeBase64Image(base64: string, format: AppConfig["defaultFormat"]): Blob {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const mimeType = format === "jpeg" ? "image/jpeg" : `image/${format}`;

  return new Blob([bytes], { type: mimeType });
}

async function imageToBlob(input: SaveImageInput): Promise<Blob> {
  if (input.image.base64) {
    return decodeBase64Image(input.image.base64, input.config.defaultFormat);
  }

  if (input.image.url) {
    const response = await fetch(input.image.url);

    if (!response.ok) {
      throw new Error(`Failed to download generated image: HTTP ${response.status}.`);
    }

    return response.blob();
  }

  throw new Error("Image payload did not include base64 data or a URL.");
}

async function batchImageToBlob(input: BatchImageSaveInput): Promise<Blob> {
  return imageToBlob({
    image: input.image,
    prompt: input.task.prompt,
    optimizedPrompt: "",
    customName: "",
    config: input.config,
    generatedAt: input.generatedAt,
    durationMs: input.durationMs,
  });
}

function buildRecord(input: SaveImageInput, outputPath: string): ImageRecord {
  return {
    id: crypto.randomUUID(),
    status: "success",
    createdAt: input.generatedAt.toISOString(),
    prompt: input.prompt,
    optimizedPrompt: input.optimizedPrompt,
    model: input.config.imageModel,
    size: input.config.defaultSize,
    outputPath,
    durationMs: input.durationMs,
  };
}

async function saveWithFileSystemAccess(
  rootHandle: FileSystemDirectoryHandle,
  dateFolder: string,
  fileName: string,
  blob: Blob,
): Promise<string> {
  const targetDirectory = dateFolder ? await rootHandle.getDirectoryHandle(dateFolder, { create: true }) : rootHandle;
  const fileHandle = await targetDirectory.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();

  return URL.createObjectURL(blob);
}

function downloadBlob(blob: Blob, fileName: string): string {
  const previewUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = previewUrl;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.click();
  return previewUrl;
}

export const webAdapter: RuntimeAdapter = {
  mode: "web",

  async loadConfig() {
    return mergeConfig(readStoredValue<Partial<AppConfig>>(CONFIG_KEY, DEFAULT_CONFIG));
  },

  async saveConfig(config: AppConfig) {
    writeStoredValue(CONFIG_KEY, config);
  },

  async loadHistory() {
    return sortHistoryNewestFirst(readStoredValue<ImageRecord[]>(HISTORY_KEY, []));
  },

  async chooseOutputDirectory() {
    if (!window.showDirectoryPicker) {
      return null;
    }

    directoryHandle = await window.showDirectoryPicker();
    return directoryHandle.name;
  },

  async saveImage(input: SaveImageInput): Promise<SaveImageResult> {
    const history = await this.loadHistory();
    const dateFolder = formatDateFolder(input.generatedAt);
    const existingFileNames = history
      .filter((record) => record.outputPath.includes(`/${dateFolder}/`) || record.outputPath.includes(`\\${dateFolder}\\`))
      .map((record) => record.outputPath.split(/[\\/]/).pop() ?? "");
    const fileName = buildImageFileName({
      customName: input.customName,
      prompt: input.prompt,
      generatedAt: input.generatedAt,
      format: input.config.defaultFormat,
      existingFileNames,
    });
    const outputPath = buildOutputPath(input.config.outputDirectory, input.generatedAt, fileName);
    const blob = await imageToBlob(input);
    const previewUrl = directoryHandle
      ? await saveWithFileSystemAccess(directoryHandle, dateFolder, fileName, blob)
      : downloadBlob(blob, fileName);
    const record = buildRecord(input, outputPath);

    writeStoredValue(HISTORY_KEY, sortHistoryNewestFirst([record, ...history]));

    return { record, previewUrl };
  },

  async saveBatchImage(input: BatchImageSaveInput): Promise<BatchImageSaveResult> {
    const history = await this.loadHistory();
    const batchFolder = buildBatchDirectoryName(input.batchCreatedAt, input.batchTitle);
    const existingFileNames = history
      .filter((record) => record.outputPath.includes(`/${batchFolder}/`) || record.outputPath.includes(`\\${batchFolder}\\`))
      .map((record) => record.outputPath.split(/[\\/]/).pop() ?? "");
    const fileName = buildBatchImageFileName(input.task, input.config.defaultFormat, existingFileNames);
    const outputRoot = input.config.outputDirectory.replace(/\\/g, "/").replace(/\/+$/g, "") || "outputs";
    const outputPath = `${outputRoot}/${batchFolder}/${fileName}`;
    const blob = await batchImageToBlob(input);
    const previewUrl = directoryHandle
      ? await saveWithFileSystemAccess(await directoryHandle.getDirectoryHandle(batchFolder, { create: true }), "", fileName, blob)
      : downloadBlob(blob, fileName);
    const record: ImageRecord = {
      id: crypto.randomUUID(),
      status: "success",
      createdAt: input.generatedAt.toISOString(),
      prompt: input.task.prompt,
      optimizedPrompt: "",
      model: input.config.imageModel,
      size: input.config.defaultSize,
      outputPath,
      durationMs: input.durationMs,
    };

    writeStoredValue(HISTORY_KEY, sortHistoryNewestFirst([record, ...history]));

    return { record, previewUrl, outputPath };
  },

  async saveBatchManifest(manifest: BatchManifest): Promise<string> {
    const batchFolder = buildBatchDirectoryName(manifest.createdAt, manifest.title);
    const fileName = "manifest.json";
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });

    if (directoryHandle) {
      const batchHandle = await directoryHandle.getDirectoryHandle(batchFolder, { create: true });
      await saveWithFileSystemAccess(batchHandle, "", fileName, blob);
    } else {
      downloadBlob(blob, fileName);
    }

    return `${batchFolder}/${fileName}`;
  },

  async openOutputPath(_path: string) {
    return;
  },
};
