import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_CONFIG } from "../core/config";
import { webAdapter } from "./webAdapter";

const ONE_PIXEL_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lwP8NwAAAABJRU5ErkJggg==";

describe("webAdapter history deletion", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
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
});
