import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_CONFIG } from "../core/config";
import { webAdapter } from "./webAdapter";

const ONE_PIXEL_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lwP8NwAAAABJRU5ErkJggg==";

describe("webAdapter history deletion", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to session memory when localStorage is blocked by the browser", async () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Access is denied for this document.", "SecurityError");
    });

    await expect(webAdapter.loadConfig()).resolves.toMatchObject(DEFAULT_CONFIG);

    await webAdapter.saveConfig({ ...DEFAULT_CONFIG, apiKey: "test-key", uiLanguage: "en-US" });

    await expect(webAdapter.loadConfig()).resolves.toMatchObject({
      apiKey: "test-key",
      uiLanguage: "en-US",
    });
  });

  it("deletes selected history records from local storage and returns the remaining records", async () => {
    const first = await webAdapter.saveImage({
      image: { base64: ONE_PIXEL_PNG },
      prompt: "first image",
      optimizedPrompt: "",
      customName: "first",
      config: { ...DEFAULT_CONFIG, defaultFormat: "png" },
      generatedAt: new Date("2026-05-05T00:00:00.000Z"),
      durationMs: 1000,
    });
    const second = await webAdapter.saveImage({
      image: { base64: ONE_PIXEL_PNG },
      prompt: "second image",
      optimizedPrompt: "",
      customName: "second",
      config: { ...DEFAULT_CONFIG, defaultFormat: "png" },
      generatedAt: new Date("2026-05-05T00:01:00.000Z"),
      durationMs: 1000,
    });

    const remaining = await webAdapter.deleteHistoryRecords([first.record.id]);

    expect(remaining.map((record) => record.id)).toEqual([second.record.id]);
    expect((await webAdapter.loadHistory()).map((record) => record.id)).toEqual([second.record.id]);
  });

  it("previews old download-mode history from an authorized downloads folder by file name", async () => {
    const imageFile = new File(["image"], "00-02-36_test.png", { type: "image/png" });
    const downloadsHandle = createDirectoryHandle({
      "00-02-36_test.png": imageFile,
    });
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(downloadsHandle));
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:old-history-preview");

    await webAdapter.chooseOutputDirectory();

    const previewUrl = await webAdapter.prepareHistoryPreview({
      id: "record-1",
      status: "success",
      createdAt: "2026-05-24T00:02:36.000Z",
      prompt: "test",
      optimizedPrompt: "",
      model: "gpt-image-2",
      size: "auto",
      outputPath: "outputs/2026-05-24/00-02-36_test.png",
      durationMs: 1000,
    });

    expect(previewUrl).toBe("blob:old-history-preview");
  });

  it("returns null when an authorized folder does not contain the old history image", async () => {
    const downloadsHandle = createDirectoryHandle({});
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(downloadsHandle));

    await webAdapter.chooseOutputDirectory();

    await expect(
      webAdapter.prepareHistoryPreview({
        id: "record-1",
        status: "success",
        createdAt: "2026-05-24T00:02:36.000Z",
        prompt: "test",
        optimizedPrompt: "",
        model: "gpt-image-2",
        size: "auto",
        outputPath: "outputs/2026-05-24/missing.png",
        durationMs: 1000,
      }),
    ).resolves.toBeNull();
  });
});

function createDirectoryHandle(entries: Record<string, File>): FileSystemDirectoryHandle {
  return {
    name: "Downloads",
    async getDirectoryHandle(name: string) {
      throw new DOMException(`Directory not found: ${name}`, "NotFoundError");
    },
    async getFileHandle(name: string) {
      const file = entries[name];
      if (!file) {
        throw new DOMException(`File not found: ${name}`, "NotFoundError");
      }

      return {
        async getFile() {
          return file;
        },
        async createWritable() {
          throw new Error("not used");
        },
      } as unknown as FileSystemFileHandle;
    },
  } as unknown as FileSystemDirectoryHandle;
}
