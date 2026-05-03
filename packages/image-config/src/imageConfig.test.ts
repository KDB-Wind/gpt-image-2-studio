import { describe, expect, it } from "vitest";

import {
  DEFAULT_IMAGE_TIMEOUT_MS,
  MAX_REFERENCE_IMAGES,
  RECOMMENDED_REFERENCE_IMAGES,
  validateImageGenerationConfig,
  validateReferenceImages,
} from "./index";

describe("image generation config", () => {
  it("normalizes image options with a 240 second default timeout", () => {
    const config = validateImageGenerationConfig({
      size: "1024x1024",
      quality: "high",
      resolution: "2k",
      outputFormat: "png",
    });

    expect(config).toMatchObject({
      size: "1024x1024",
      quality: "high",
      resolution: "2k",
      outputFormat: "png",
      timeoutMs: DEFAULT_IMAGE_TIMEOUT_MS,
    });
  });

  it("rejects invalid size, quality, resolution, output format, and too-short timeouts", () => {
    expect(() =>
      validateImageGenerationConfig({
        size: "999x999",
        quality: "cinematic",
        resolution: "8k",
        outputFormat: "gif",
        timeoutMs: 10_000,
      }),
    ).toThrow("Invalid image generation config");
  });

  it("allows up to 8 reference images while warning above the recommended 4 images", () => {
    const images = Array.from({ length: 5 }, (_, index) => ({
      data: `image-${index}`,
      mimeType: "image/png",
      filename: `image-${index}.png`,
    }));

    const result = validateReferenceImages(images);

    expect(MAX_REFERENCE_IMAGES).toBe(8);
    expect(RECOMMENDED_REFERENCE_IMAGES).toBe(4);
    expect(result.images).toHaveLength(5);
    expect(result.warnings).toEqual(["建议参考图不超过 4 张，过多图片可能降低稳定性。"]);
  });

  it("rejects more than 8 reference images", () => {
    const images = Array.from({ length: 9 }, (_, index) => ({
      data: `image-${index}`,
      mimeType: "image/png",
      filename: `image-${index}.png`,
    }));

    expect(() => validateReferenceImages(images)).toThrow("最多只能上传 8 张参考图。");
  });
});
