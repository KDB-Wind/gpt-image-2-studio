import type { ParsedImage } from "../core/apiClient";
import type {
  BatchImageSaveInput,
  BatchImageSaveResult,
  BatchManifest,
  BatchWorkspace,
  ImageSaveMode,
} from "../core/batchTypes";
import type { AppConfig } from "../core/config";
import type { ImageRecord } from "../core/history";

export type SaveImageInput = {
  image: ParsedImage;
  prompt: string;
  optimizedPrompt: string;
  customName: string;
  config: AppConfig;
  generatedAt: Date;
  durationMs: number;
};

export type SaveImageResult = {
  record: ImageRecord;
  previewUrl: string;
  saveMode: ImageSaveMode;
  saveFallbackReason?: string;
};

export type OutputDirectoryTestResult = {
  ok: boolean;
  fileName?: string;
  bytes?: number;
  lastTestedAt?: string;
  message?: string;
};

export type OutputDirectoryState =
  | { status: "unsupported" }
  | { status: "not-authorized" }
  | { status: "permission-required"; name: string }
  | { status: "ready"; name: string; lastTestedAt: string };

export type RuntimeStorageCapabilities = {
  local: boolean;
  session: boolean;
};

export type RuntimeAdapter = {
  mode: "web" | "desktop";
  loadConfig(): Promise<AppConfig>;
  saveConfig(config: AppConfig): Promise<void>;
  getStorageCapabilities?(): Promise<RuntimeStorageCapabilities>;
  loadHistory(): Promise<ImageRecord[]>;
  deleteHistoryRecords(recordIds: string[]): Promise<ImageRecord[]>;
  prepareHistoryPreview(record: ImageRecord): Promise<string | null>;
  prepareHistoryFile(record: ImageRecord): Promise<File | null>;
  getOutputDirectoryState(): Promise<OutputDirectoryState>;
  testOutputDirectory(): Promise<OutputDirectoryTestResult>;
  saveImage(input: SaveImageInput): Promise<SaveImageResult>;
  saveBatchImage(input: BatchImageSaveInput): Promise<BatchImageSaveResult>;
  saveBatchManifest(manifest: BatchManifest): Promise<string>;
  loadBatchWorkspace?(): Promise<BatchWorkspace | null>;
  saveBatchWorkspace?(workspace: BatchWorkspace): Promise<void>;
  chooseOutputDirectory(): Promise<string | null>;
  openOutputPath(path: string): Promise<void>;
};
