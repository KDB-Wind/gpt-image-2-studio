import { describe, expect, it } from "vitest";

import {
  IMAGE_SIZE_PRESETS,
  getImageSizePresetCategory,
  getImageSizePresetValue,
  isCompressionFormat,
  parseImageSize,
  validateImageSize,
} from "./imageOptions";

describe("parseImageSize", () => {
  it("parses WIDTHxHEIGHT values", () => {
    expect(parseImageSize("2048x1152")).toEqual({ width: 2048, height: 1152 });
  });

  it("returns null for auto", () => {
    expect(parseImageSize("auto")).toBeNull();
  });

  it("returns null for invalid values", () => {
    expect(parseImageSize("wide")).toBeNull();
    expect(parseImageSize("1024*1024")).toBeNull();
  });
});

describe("validateImageSize", () => {
  it("accepts auto and bundled presets", () => {
    expect(validateImageSize("auto")).toEqual({ error: null, warning: null });
    expect(validateImageSize("3840x2160")).toEqual({
      error: null,
      warning: "High-resolution sizes can take longer and may not be supported by every compatible provider.",
    });
  });

  it("rejects sizes below the documented minimum total pixels", () => {
    expect(validateImageSize("624x1024").error).toBe(
      "Image size must contain between 655,360 and 8,294,400 total pixels.",
    );
  });

  it("rejects sizes that are not multiples of 16", () => {
    expect(validateImageSize("1025x1024").error).toBe(
      "Image size width and height must both be multiples of 16.",
    );
  });

  it("rejects sizes with an edge above 3840", () => {
    expect(validateImageSize("4096x2048").error).toBe(
      "Image size cannot exceed 3840 pixels on either edge.",
    );
  });

  it("rejects sizes with aspect ratios above 3:1", () => {
    expect(validateImageSize("3072x512").error).toBe(
      "Image size aspect ratio cannot exceed 3:1.",
    );
  });

  it("rejects sizes above the documented maximum total pixels", () => {
    expect(validateImageSize("3840x2304").error).toBe(
      "Image size must contain between 655,360 and 8,294,400 total pixels.",
    );
  });

  it("warns when the size falls into the documented experimental range", () => {
    expect(validateImageSize("2560x1456")).toEqual({
      error: null,
      warning: "High-resolution sizes can take longer and may not be supported by every compatible provider.",
    });
  });
});

describe("image size presets", () => {
  it("includes bundled 1K, 2K, and 4K options", () => {
    expect(IMAGE_SIZE_PRESETS.map((preset) => preset.value)).toEqual([
      "auto",
      "1024x1024",
      "1536x1024",
      "1024x1536",
      "2048x2048",
      "2048x1152",
      "3840x2160",
      "2160x3840",
    ]);
  });

  it("classifies preset categories for UI labels", () => {
    expect(getImageSizePresetCategory("auto")).toBe("auto");
    expect(getImageSizePresetCategory("2048x2048")).toBe("2K");
    expect(getImageSizePresetCategory("3840x2160")).toBe("4K");
  });

  it("uses custom mode for non-bundled sizes", () => {
    expect(getImageSizePresetValue("1280x720")).toBe("custom");
  });
});

describe("isCompressionFormat", () => {
  it("enables compression only for jpeg and webp", () => {
    expect(isCompressionFormat("png")).toBe(false);
    expect(isCompressionFormat("jpeg")).toBe(true);
    expect(isCompressionFormat("webp")).toBe(true);
  });
});
