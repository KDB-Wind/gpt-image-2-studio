import { DEFAULT_CONFIG, mergeConfig, type AppConfig } from "../core/config";
import { buildBatchDirectoryName, buildBatchImageFileName } from "../core/batchManifest";
import type { BatchImageSaveInput, BatchImageSaveResult, BatchManifest } from "../core/batchTypes";
import { buildImageFileName, buildOutputPath, formatDateFolder } from "../core/fileNames";
import { sortHistoryNewestFirst, type ImageRecord } from "../core/history";
import type { RuntimeAdapter, SaveImageInput, SaveImageResult } from "./types";

const CONFIG_KEY = "chat-to-image.config.v1";
const HISTORY_KEY = "chat-to-image.history.v1";
const FILE_HANDLE_DB_NAME = "chat-to-image.file-handles.v1";
const FILE_HANDLE_STORE_NAME = "handles";
const OUTPUT_DIRECTORY_HANDLE_KEY = "output-directory";

let directoryHandle: FileSystemDirectoryHandle | null = null;
const memoryStorageFallback = new Map<string, string>();

function getBrowserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readStoredValue<T>(key: string, fallback: T): T {
  const storage = getBrowserStorage();
  let raw: string | null = null;

  if (storage) {
    try {
      raw = storage.getItem(key);
    } catch {
      raw = memoryStorageFallback.get(key) ?? null;
    }
  } else {
    raw = memoryStorageFallback.get(key) ?? null;
  }

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
  const serializedValue = JSON.stringify(value);
  const storage = getBrowserStorage();

  if (storage) {
    try {
      storage.setItem(key, serializedValue);
      return;
    } catch {
      // Some embedded file:// browsers expose localStorage but deny reads/writes.
    }
  }

  memoryStorageFallback.set(key, serializedValue);
}

function getIndexedDb(): IDBFactory | null {
  try {
    return globalThis.indexedDB ?? null;
  } catch {
    return null;
  }
}

function openFileHandleDatabase(): Promise<IDBDatabase | null> {
  const indexedDb = getIndexedDb();

  if (!indexedDb) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const request = indexedDb.open(FILE_HANDLE_DB_NAME, 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(FILE_HANDLE_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

async function persistDirectoryHandle(handle: FileSystemDirectoryHandle) {
  const db = await openFileHandleDatabase();

  if (!db) {
    return;
  }

  await new Promise<void>((resolve) => {
    const transaction = db.transaction(FILE_HANDLE_STORE_NAME, "readwrite");
    transaction.objectStore(FILE_HANDLE_STORE_NAME).put(handle, OUTPUT_DIRECTORY_HANDLE_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
  db.close();
}

async function readPersistedDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openFileHandleDatabase();

  if (!db) {
    return null;
  }

  const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve) => {
    const transaction = db.transaction(FILE_HANDLE_STORE_NAME, "readonly");
    const request = transaction.objectStore(FILE_HANDLE_STORE_NAME).get(OUTPUT_DIRECTORY_HANDLE_KEY);
    request.onsuccess = () => resolve((request.result as FileSystemDirectoryHandle | undefined) ?? null);
    request.onerror = () => resolve(null);
    transaction.onerror = () => resolve(null);
    transaction.onabort = () => resolve(null);
  });
  db.close();

  return handle;
}

async function ensureDirectoryPermission(handle: FileSystemDirectoryHandle, mode: "read" | "readwrite") {
  try {
    if (handle.queryPermission && (await handle.queryPermission({ mode })) === "granted") {
      return true;
    }

    if (handle.requestPermission) {
      return (await handle.requestPermission({ mode })) === "granted";
    }

    return true;
  } catch {
    return false;
  }
}

async function resolveDirectoryHandle(mode: "read" | "readwrite") {
  if (directoryHandle && (await ensureDirectoryPermission(directoryHandle, mode))) {
    return directoryHandle;
  }

  const persistedHandle = await readPersistedDirectoryHandle();

  if (persistedHandle && (await ensureDirectoryPermission(persistedHandle, mode))) {
    directoryHandle = persistedHandle;
    return persistedHandle;
  }

  return null;
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

function getPathSegments(outputPath: string): string[] {
  return outputPath
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .filter((segment) => !/^[A-Za-z]:$/.test(segment));
}

function getCandidateHistoryPaths(outputPath: string): string[][] {
  const segments = getPathSegments(outputPath);
  const fileName = segments.at(-1);

  if (!fileName) {
    return [];
  }

  const candidates = [segments];

  if (segments.length > 1) {
    candidates.push(segments.slice(1));
  }

  candidates.push([fileName]);

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = candidate.join("/");
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

async function tryReadFile(rootHandle: FileSystemDirectoryHandle, pathSegments: string[]): Promise<File | null> {
  if (pathSegments.length === 0) {
    return null;
  }

  try {
    let currentHandle = rootHandle;

    for (const directoryName of pathSegments.slice(0, -1)) {
      currentHandle = await currentHandle.getDirectoryHandle(directoryName);
    }

    const fileHandle = await currentHandle.getFileHandle(pathSegments[pathSegments.length - 1]);
    return fileHandle.getFile();
  } catch {
    return null;
  }
}

async function findHistoryFile(rootHandle: FileSystemDirectoryHandle, outputPath: string): Promise<File | null> {
  for (const candidatePath of getCandidateHistoryPaths(outputPath)) {
    const file = await tryReadFile(rootHandle, candidatePath);

    if (file) {
      return file;
    }
  }

  return null;
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

  async deleteHistoryRecords(recordIds: string[]) {
    const recordIdSet = new Set(recordIds);
    const remaining = sortHistoryNewestFirst((await this.loadHistory()).filter((record) => !recordIdSet.has(record.id)));
    writeStoredValue(HISTORY_KEY, remaining);
    return remaining;
  },

  async chooseOutputDirectory() {
    if (!window.showDirectoryPicker) {
      return null;
    }

    directoryHandle = await window.showDirectoryPicker();
    await persistDirectoryHandle(directoryHandle);
    return directoryHandle.name;
  },

  async prepareHistoryPreview(record: ImageRecord) {
    const rootHandle = await resolveDirectoryHandle("read");

    if (!rootHandle) {
      return null;
    }

    const file = await findHistoryFile(rootHandle, record.outputPath);

    if (!file) {
      return null;
    }

    return URL.createObjectURL(file);
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
    const outputDirectoryHandle = await resolveDirectoryHandle("readwrite");
    const previewUrl = outputDirectoryHandle
      ? await saveWithFileSystemAccess(outputDirectoryHandle, dateFolder, fileName, blob)
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
    const outputDirectoryHandle = await resolveDirectoryHandle("readwrite");
    const previewUrl = outputDirectoryHandle
      ? await saveWithFileSystemAccess(await outputDirectoryHandle.getDirectoryHandle(batchFolder, { create: true }), "", fileName, blob)
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

    const outputDirectoryHandle = await resolveDirectoryHandle("readwrite");

    if (outputDirectoryHandle) {
      const batchHandle = await outputDirectoryHandle.getDirectoryHandle(batchFolder, { create: true });
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
