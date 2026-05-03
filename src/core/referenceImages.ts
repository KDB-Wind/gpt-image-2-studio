export const MAX_REFERENCE_IMAGES = 8;
export const RECOMMENDED_REFERENCE_IMAGES = 4;

export type ReferenceImageItem = {
  id: string;
  file: File;
  previewUrl: string;
};

export type AddReferenceImagesResult = {
  images: ReferenceImageItem[];
  addedCount: number;
  invalidCount: number;
  overflowCount: number;
};

export function addReferenceImages(
  existingImages: ReferenceImageItem[],
  incomingFiles: Iterable<File>,
  createPreviewUrl: (file: File) => string = (file) => URL.createObjectURL(file),
): AddReferenceImagesResult {
  const nextImages = [...existingImages];
  const remainingSlots = Math.max(0, MAX_REFERENCE_IMAGES - existingImages.length);

  let addedCount = 0;
  let invalidCount = 0;
  let overflowCount = 0;

  for (const file of incomingFiles) {
    if (!file.type.startsWith("image/")) {
      invalidCount += 1;
      continue;
    }

    if (addedCount >= remainingSlots) {
      overflowCount += 1;
      continue;
    }

    nextImages.push({
      id: crypto.randomUUID(),
      file,
      previewUrl: createPreviewUrl(file),
    });
    addedCount += 1;
  }

  return {
    images: nextImages,
    addedCount,
    invalidCount,
    overflowCount,
  };
}
