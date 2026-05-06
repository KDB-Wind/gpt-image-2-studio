import { DEFAULT_CONFIG, mergeConfig, type AppConfig } from "../core/config";
import { buildImageFileName, buildOutputPath, formatDateFolder } from "../core/fileNames";
import { removeHistoryRecords, sortHistoryNewestFirst, type ImageRecord } from "../core/history";
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
  const dateDirectory = await rootHandle.getDirectoryHandle(dateFolder, { create: true });
  const fileHandle = await dateDirectory.getFileHandle(fileName, { create: true });
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

  async deleteHistoryRecords(ids: string[]) {
    const remaining = sortHistoryNewestFirst(removeHistoryRecords(await this.loadHistory(), new Set(ids)));
    writeStoredValue(HISTORY_KEY, remaining);
    return remaining;
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

  async openOutputPath(_path: string) {
    return;
  },

  async openOutputDirectory(_config: AppConfig) {
    return;
  },
};
