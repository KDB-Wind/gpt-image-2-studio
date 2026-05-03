import { describe, expect, it } from "vitest";

import {
  MAX_REFERENCE_IMAGES,
  RECOMMENDED_REFERENCE_IMAGES,
  addReferenceImages,
  type ReferenceImageItem,
} from "./referenceImages";

function createImageFile(name: string, sizeText = "image-data"): File {
  return new File([sizeText], name, { type: "image/png" });
}

function createTextFile(name: string): File {
  return new File(["not-an-image"], name, { type: "text/plain" });
}

function createExistingImage(name: string): ReferenceImageItem {
  return {
    id: `${name}-id`,
    file: createImageFile(name),
    previewUrl: `blob:${name}`,
  };
}

describe("reference image limits", () => {
  it("exports the configured maximum and recommendation", () => {
    expect(MAX_REFERENCE_IMAGES).toBe(8);
    expect(RECOMMENDED_REFERENCE_IMAGES).toBe(4);
  });
});

describe("addReferenceImages", () => {
  it("adds multiple valid images into an empty collection", () => {
    const result = addReferenceImages([], [
      createImageFile("one.png"),
      createImageFile("two.png"),
      createImageFile("three.png"),
    ]);

    expect(result.images.map((item) => item.file.name)).toEqual([
      "one.png",
      "two.png",
      "three.png",
    ]);
    expect(result.addedCount).toBe(3);
    expect(result.invalidCount).toBe(0);
    expect(result.overflowCount).toBe(0);
  });

  it("keeps existing images and only fills remaining slots up to the maximum", () => {
    const existing = Array.from({ length: 6 }, (_, index) => createExistingImage(`existing-${index + 1}.png`));

    const result = addReferenceImages(existing, [
      createImageFile("new-1.png"),
      createImageFile("new-2.png"),
      createImageFile("new-3.png"),
    ]);

    expect(result.images).toHaveLength(8);
    expect(result.images.slice(0, 6).map((item) => item.file.name)).toEqual(existing.map((item) => item.file.name));
    expect(result.images.slice(6).map((item) => item.file.name)).toEqual(["new-1.png", "new-2.png"]);
    expect(result.addedCount).toBe(2);
    expect(result.overflowCount).toBe(1);
  });

  it("rejects non-image files while still adding valid images", () => {
    const result = addReferenceImages([], [
      createImageFile("poster.png"),
      createTextFile("notes.txt"),
      createImageFile("cover.png"),
    ]);

    expect(result.images.map((item) => item.file.name)).toEqual(["poster.png", "cover.png"]);
    expect(result.addedCount).toBe(2);
    expect(result.invalidCount).toBe(1);
    expect(result.overflowCount).toBe(0);
  });
});
