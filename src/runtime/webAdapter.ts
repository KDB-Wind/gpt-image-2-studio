import { DEFAULT_CONFIG, mergeConfig, type AppConfig } from "../core/config";
import { buildBatchDirectoryName, buildBatchImageFileName, sanitizeBatchManifest } from "../core/batchManifest";
import type { BatchImageSaveInput, BatchImageSaveResult, BatchManifest } from "../core/batchTypes";
import { buildImageFileName, formatDateFolder } from "../core/fileNames";
import { safeErrorMessage } from "../core/errorSanitizer";
import { sortHistoryNewestFirst, type ImageRecord } from "../core/history";
import type { OutputDirectoryState, RuntimeAdapter, SaveImageInput, SaveImageResult } from "./types";

const CONFIG_KEY = "chat-to-image.config.v1";
const SESSION_API_KEY = "chat-to-image.api-key.session.v1";
const PERSISTENT_API_KEY = "chat-to-image.api-key.persistent.v1";
const HISTORY_KEY = "chat-to-image.history.v1";
const FILE_HANDLE_DB_NAME = "chat-to-image.file-handles.v1";
const FILE_HANDLE_STORE_NAME = "handles";
const OUTPUT_DIRECTORY_HANDLE_KEY = "output-directory";
const OUTPUT_DIRECTORY_STATE_KEY = "output-directory-state";
const OUTPUT_DIRECTORY_TEST_FILE_NAME = "gpt-image-2-studio-folder-test.png";
const OUTPUT_DIRECTORY_TEST_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lwP8NwAAAABJRU5ErkJggg==";

let directoryHandle: FileSystemDirectoryHandle | null = null;
let readyOutputDirectory: PersistedReadyOutputDirectory | null = null;
const memoryStorageFallback = new Map<string, string>();
const memorySessionStorageFallback = new Map<string, string>();

function getBrowserStorage(kind: "local" | "session" = "local"): Storage | null {
  try {
    return kind === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

function getMemoryStorage(kind: "local" | "session") {
  return kind === "session" ? memorySessionStorageFallback : memoryStorageFallback;
}

function readStoredValue<T>(key: string, fallback: T, kind: "local" | "session" = "local"): T {
  const storage = getBrowserStorage(kind);
  const memoryStorage = getMemoryStorage(kind);
  let raw: string | null = null;

  if (storage) {
    try {
      raw = storage.getItem(key);
    } catch {
      raw = memoryStorage.get(key) ?? null;
    }
  } else {
    raw = memoryStorage.get(key) ?? null;
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

function writeStoredValue(key: string, value: unknown, kind: "local" | "session" = "local") {
  const serializedValue = JSON.stringify(value);
  const storage = getBrowserStorage(kind);
  const memoryStorage = getMemoryStorage(kind);

  if (storage) {
    try {
      storage.setItem(key, serializedValue);
      return;
    } catch {
      // Some embedded file:// browsers expose localStorage but deny reads/writes.
    }
  }

  memoryStorage.set(key, serializedValue);
}

function removeStoredValue(key: string, kind: "local" | "session" = "local") {
  const storage = getBrowserStorage(kind);
  const memoryStorage = getMemoryStorage(kind);

  if (storage) {
    try {
      storage.removeItem(key);
    } catch {
      // Restricted file:// runtimes fall through to the in-memory store.
    }
  }

  memoryStorage.delete(key);
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
    let request: IDBOpenDBRequest;
    try {
      request = indexedDb.open(FILE_HANDLE_DB_NAME, 1);
    } catch {
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      try {
        request.result.createObjectStore(FILE_HANDLE_STORE_NAME);
      } catch {
        try {
          request.result.close();
        } catch {
          // Ignore follow-up close failures in restricted runtimes.
        }
        resolve(null);
      }
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
    try {
      const transaction = db.transaction(FILE_HANDLE_STORE_NAME, "readwrite");
      transaction.objectStore(FILE_HANDLE_STORE_NAME).put(handle, OUTPUT_DIRECTORY_HANDLE_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

async function readPersistedDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openFileHandleDatabase();

  if (!db) {
    return null;
  }

  const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve) => {
    try {
      const transaction = db.transaction(FILE_HANDLE_STORE_NAME, "readonly");
      const request = transaction.objectStore(FILE_HANDLE_STORE_NAME).get(OUTPUT_DIRECTORY_HANDLE_KEY);
      request.onsuccess = () => resolve((request.result as FileSystemDirectoryHandle | undefined) ?? null);
      request.onerror = () => resolve(null);
      transaction.onerror = () => resolve(null);
      transaction.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  db.close();

  return handle;
}

type PersistedReadyOutputDirectory = {
  handle: FileSystemDirectoryHandle;
  name: string;
  lastTestedAt: string;
};

async function persistReadyOutputDirectory(state: PersistedReadyOutputDirectory) {
  readyOutputDirectory = state;
  const db = await openFileHandleDatabase();

  if (!db) {
    return;
  }

  await new Promise<void>((resolve) => {
    try {
      const transaction = db.transaction(FILE_HANDLE_STORE_NAME, "readwrite");
      transaction.objectStore(FILE_HANDLE_STORE_NAME).put(state, OUTPUT_DIRECTORY_STATE_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

async function readPersistedReadyOutputDirectory(): Promise<PersistedReadyOutputDirectory | null> {
  const db = await openFileHandleDatabase();

  if (!db) {
    return null;
  }

  const state = await new Promise<unknown>((resolve) => {
    try {
      const transaction = db.transaction(FILE_HANDLE_STORE_NAME, "readonly");
      const request = transaction.objectStore(FILE_HANDLE_STORE_NAME).get(OUTPUT_DIRECTORY_STATE_KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      transaction.onerror = () => resolve(null);
      transaction.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  db.close();

  return isPersistedReadyOutputDirectory(state) ? state : null;
}

async function clearPersistedReadyOutputDirectory() {
  readyOutputDirectory = null;
  const db = await openFileHandleDatabase();

  if (!db) {
    return;
  }

  await new Promise<void>((resolve) => {
    try {
      const transaction = db.transaction(FILE_HANDLE_STORE_NAME, "readwrite");
      transaction.objectStore(FILE_HANDLE_STORE_NAME).delete(OUTPUT_DIRECTORY_STATE_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
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

async function findKnownDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  if (directoryHandle) {
    return directoryHandle;
  }

  const persistedHandle = await readPersistedDirectoryHandle();
  if (persistedHandle) {
    directoryHandle = persistedHandle;
  }

  return persistedHandle;
}

async function hasDirectoryPermission(handle: FileSystemDirectoryHandle, mode: "read" | "readwrite") {
  try {
    if (!handle.queryPermission) {
      return false;
    }

    return (await handle.queryPermission({ mode })) === "granted";
  } catch {
    return false;
  }
}

function isPersistedReadyOutputDirectory(value: unknown): value is PersistedReadyOutputDirectory {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.name === "string" &&
    typeof candidate.lastTestedAt === "string" &&
    typeof candidate.handle === "object" &&
    candidate.handle !== null
  );
}

export async function isSameOutputDirectoryHandle(
  currentHandle: FileSystemDirectoryHandle,
  testedHandle: FileSystemDirectoryHandle,
): Promise<boolean> {
  if (currentHandle === testedHandle) {
    return true;
  }

  if (typeof currentHandle.isSameEntry === "function") {
    try {
      return await currentHandle.isSameEntry(testedHandle);
    } catch {
      return false;
    }
  }

  if (typeof testedHandle.isSameEntry === "function") {
    try {
      return await testedHandle.isSameEntry(currentHandle);
    } catch {
      return false;
    }
  }

  return false;
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
    try {
      const response = await fetch(input.image.url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return response.blob();
    } catch (error) {
      const reason = safeErrorMessage(error);
      throw new Error(
        `The provider returned an image URL, but this browser could not download it. ` +
          `This is usually caused by CORS restrictions on the provider-hosted image. ` +
          `Use a provider or request mode that returns b64_json image data. Original error: ${reason}`,
      );
    }
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

function buildFileSystemAccessOutputPath(rootName: string, childDirectory: string, fileName: string): string {
  return [rootName, childDirectory, fileName]
    .map((segment) => segment.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
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
    const storedValue = readStoredValue<unknown>(CONFIG_KEY, DEFAULT_CONFIG);
    const storedConfig = storedValue && typeof storedValue === "object" && !Array.isArray(storedValue)
      ? storedValue as Partial<AppConfig>
      : {};
    const legacyApiKey = typeof storedConfig.apiKey === "string" ? storedConfig.apiKey : "";
    const { apiKey: _legacyApiKey, ...persistableConfig } = storedConfig;
    const mergedConfig = mergeConfig({ ...persistableConfig, apiKey: "" });
    const sessionApiKey = readStoredValue<string>(SESSION_API_KEY, "", "session");
    const persistentApiKey = mergedConfig.rememberApiKey
      ? readStoredValue<string>(PERSISTENT_API_KEY, "")
      : "";
    const apiKey = sessionApiKey || persistentApiKey || legacyApiKey;

    if (!mergedConfig.rememberApiKey) {
      removeStoredValue(PERSISTENT_API_KEY);
    }

    if (legacyApiKey) {
      writeStoredValue(SESSION_API_KEY, legacyApiKey, "session");
      if (mergedConfig.rememberApiKey) {
        writeStoredValue(PERSISTENT_API_KEY, legacyApiKey);
      }
      writeStoredValue(CONFIG_KEY, persistableConfig);
    }

    return { ...mergedConfig, apiKey };
  },

  async saveConfig(config: AppConfig) {
    const { apiKey, ...persistableConfig } = config;
    writeStoredValue(CONFIG_KEY, persistableConfig);

    if (apiKey) {
      writeStoredValue(SESSION_API_KEY, apiKey, "session");
    } else {
      removeStoredValue(SESSION_API_KEY, "session");
    }

    if (config.rememberApiKey && apiKey) {
      writeStoredValue(PERSISTENT_API_KEY, apiKey);
    } else {
      removeStoredValue(PERSISTENT_API_KEY);
    }
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

    const showDirectoryPicker = window.showDirectoryPicker as unknown as (
      options?: { mode: "read" | "readwrite" },
    ) => Promise<FileSystemDirectoryHandle>;
    directoryHandle = await showDirectoryPicker({ mode: "readwrite" });

    if (!(await ensureDirectoryPermission(directoryHandle, "readwrite"))) {
      directoryHandle = null;
      throw new Error("Output folder write permission was not granted.");
    }

    await persistDirectoryHandle(directoryHandle);
    await clearPersistedReadyOutputDirectory();
    return directoryHandle.name;
  },

  async getOutputDirectoryState(): Promise<OutputDirectoryState> {
    if (!window.showDirectoryPicker) {
      return { status: "unsupported" };
    }

    const handle = await findKnownDirectoryHandle();
    if (!handle) {
      return { status: "not-authorized" };
    }

    if (!(await hasDirectoryPermission(handle, "readwrite"))) {
      return { status: "permission-required", name: handle.name };
    }

    const persistedState = readyOutputDirectory ?? (await readPersistedReadyOutputDirectory());
    if (persistedState && (await isSameOutputDirectoryHandle(handle, persistedState.handle))) {
      return { status: "ready", name: handle.name, lastTestedAt: persistedState.lastTestedAt };
    }

    return { status: "permission-required", name: handle.name };
  },

  async prepareHistoryPreview(record: ImageRecord) {
    const file = await this.prepareHistoryFile(record);

    if (!file) {
      return null;
    }

    return URL.createObjectURL(file);
  },

  async prepareHistoryFile(record: ImageRecord) {
    const rootHandle = await resolveDirectoryHandle("read");

    if (!rootHandle) {
      return null;
    }

    return findHistoryFile(rootHandle, record.outputPath);
  },

  async testOutputDirectory() {
    const rootHandle = await resolveDirectoryHandle("readwrite");

    if (!rootHandle) {
      await clearPersistedReadyOutputDirectory();
      return {
        ok: false,
        message: "Output folder is not authorized.",
      };
    }

    try {
      const blob = decodeBase64Image(OUTPUT_DIRECTORY_TEST_PNG, "png");
      await saveWithFileSystemAccess(rootHandle, "", OUTPUT_DIRECTORY_TEST_FILE_NAME, blob);
      const savedFile = await rootHandle.getFileHandle(OUTPUT_DIRECTORY_TEST_FILE_NAME).then((handle) => handle.getFile());
      const lastTestedAt = new Date().toISOString();

      if (savedFile.size > 0) {
        await persistReadyOutputDirectory({ handle: rootHandle, name: rootHandle.name, lastTestedAt });
      } else {
        await clearPersistedReadyOutputDirectory();
      }

      return {
        ok: savedFile.size > 0,
        fileName: OUTPUT_DIRECTORY_TEST_FILE_NAME,
        bytes: savedFile.size,
      };
    } catch (error) {
      await clearPersistedReadyOutputDirectory();
      return {
        ok: false,
        fileName: OUTPUT_DIRECTORY_TEST_FILE_NAME,
        message: safeErrorMessage(error),
      };
    }
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
    const blob = await imageToBlob(input);
    const outputDirectoryHandle = await resolveDirectoryHandle("readwrite");
    let outputPath = fileName;
    let previewUrl: string;
    let saveMode: SaveImageResult["saveMode"] = "browser-download";
    let saveFallbackReason: string | undefined;

    if (outputDirectoryHandle) {
      try {
        previewUrl = await saveWithFileSystemAccess(outputDirectoryHandle, dateFolder, fileName, blob);
        outputPath = buildFileSystemAccessOutputPath(outputDirectoryHandle.name, dateFolder, fileName);
        saveMode = "authorized-directory";
      } catch (error) {
        saveFallbackReason = safeErrorMessage(error);
        previewUrl = downloadBlob(blob, fileName);
      }
    } else {
      previewUrl = downloadBlob(blob, fileName);
    }

    const record = buildRecord(input, outputPath);

    writeStoredValue(HISTORY_KEY, sortHistoryNewestFirst([record, ...history]));

    return { record, previewUrl, saveMode, saveFallbackReason };
  },

  async saveBatchImage(input: BatchImageSaveInput): Promise<BatchImageSaveResult> {
    const history = await this.loadHistory();
    const batchFolder = buildBatchDirectoryName(input.batchCreatedAt, input.batchTitle);
    const existingFileNames = history
      .filter((record) => record.outputPath.includes(`/${batchFolder}/`) || record.outputPath.includes(`\\${batchFolder}\\`))
      .map((record) => record.outputPath.split(/[\\/]/).pop() ?? "");
    const fileName = buildBatchImageFileName(input.task, input.config.defaultFormat, existingFileNames);
    const blob = await batchImageToBlob(input);
    const outputDirectoryHandle = await resolveDirectoryHandle("readwrite");
    let outputPath = fileName;
    let previewUrl: string;
    let saveMode: BatchImageSaveResult["saveMode"] = "browser-download";
    let saveFallbackReason: string | undefined;

    if (outputDirectoryHandle) {
      try {
        previewUrl = await saveWithFileSystemAccess(
          await outputDirectoryHandle.getDirectoryHandle(batchFolder, { create: true }),
          "",
          fileName,
          blob,
        );
        outputPath = buildFileSystemAccessOutputPath(outputDirectoryHandle.name, batchFolder, fileName);
        saveMode = "authorized-directory";
      } catch (error) {
        saveFallbackReason = safeErrorMessage(error);
        previewUrl = downloadBlob(blob, fileName);
      }
    } else {
      previewUrl = downloadBlob(blob, fileName);
    }

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
      batch: {
        id: input.batchId,
        title: input.batchTitle,
        createdAt: input.batchCreatedAt,
        taskId: input.task.id,
        taskIndex: input.task.index,
        taskTitle: input.task.title,
        totalTasks: undefined,
      },
    };

    writeStoredValue(HISTORY_KEY, sortHistoryNewestFirst([record, ...history]));

    return { record, previewUrl, outputPath, saveMode, saveFallbackReason };
  },

  async saveBatchManifest(manifest: BatchManifest): Promise<string> {
    const safeManifest = sanitizeBatchManifest(manifest);
    const batchFolder = buildBatchDirectoryName(manifest.createdAt, manifest.title);
    const fileName = "manifest.json";
    const blob = new Blob([JSON.stringify(safeManifest, null, 2)], { type: "application/json" });

    const outputDirectoryHandle = await resolveDirectoryHandle("readwrite");

    if (outputDirectoryHandle) {
      try {
        const batchHandle = await outputDirectoryHandle.getDirectoryHandle(batchFolder, { create: true });
        await saveWithFileSystemAccess(batchHandle, "", fileName, blob);
        return buildFileSystemAccessOutputPath(outputDirectoryHandle.name, batchFolder, fileName);
      } catch {
        downloadBlob(blob, fileName);
        return fileName;
      }
    } else {
      downloadBlob(blob, fileName);
    }

    return fileName;
  },

  async openOutputPath(_path: string) {
    return;
  },
};

export function __resetWebAdapterForTests() {
  directoryHandle = null;
  readyOutputDirectory = null;
  memoryStorageFallback.clear();
  memorySessionStorageFallback.clear();
}
