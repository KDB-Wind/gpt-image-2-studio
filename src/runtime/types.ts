import type { ParsedImage } from "../core/apiClient";
import type { BatchImageSaveInput, BatchImageSaveResult, BatchManifest } from "../core/batchTypes";
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
};

export type RuntimeAdapter = {
  mode: "web" | "desktop";
  loadConfig(): Promise<AppConfig>;
  saveConfig(config: AppConfig): Promise<void>;
  loadHistory(): Promise<ImageRecord[]>;
  deleteHistoryRecords(recordIds: string[]): Promise<ImageRecord[]>;
  prepareHistoryPreview(record: ImageRecord): Promise<string | null>;
  saveImage(input: SaveImageInput): Promise<SaveImageResult>;
  saveBatchImage(input: BatchImageSaveInput): Promise<BatchImageSaveResult>;
  saveBatchManifest(manifest: BatchManifest): Promise<string>;
  chooseOutputDirectory(): Promise<string | null>;
  openOutputPath(path: string): Promise<void>;
};
