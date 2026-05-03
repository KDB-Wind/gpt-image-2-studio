export const DEFAULT_IMAGE_TIMEOUT_MS = 240_000;
export const MAX_REFERENCE_IMAGES = 8;
export const RECOMMENDED_REFERENCE_IMAGES = 4;

export const IMAGE_SIZES = ["1024x1024", "1024x1536", "1536x1024", "auto"] as const;
export const IMAGE_QUALITIES = ["auto", "low", "medium", "high"] as const;
export const IMAGE_RESOLUTIONS = ["1k", "2k", "4k"] as const;
export const IMAGE_OUTPUT_FORMATS = ["png", "jpeg", "webp"] as const;

export type ImageSize = (typeof IMAGE_SIZES)[number];
export type ImageQuality = (typeof IMAGE_QUALITIES)[number];
export type ImageResolution = (typeof IMAGE_RESOLUTIONS)[number];
export type ImageOutputFormat = (typeof IMAGE_OUTPUT_FORMATS)[number];

export type ImageGenerationConfigInput = {
  size?: string | null;
  quality?: string | null;
  resolution?: string | null;
  outputFormat?: string | null;
  timeoutMs?: number | null;
  n?: number | null;
};

export type ImageGenerationConfig = {
  size: ImageSize;
  quality: ImageQuality;
  resolution: ImageResolution;
  outputFormat: ImageOutputFormat;
  timeoutMs: number;
  n: number;
};

export type ReferenceImageInput = {
  data: string | Uint8Array | ArrayBuffer;
  mimeType: string;
  filename?: string;
};

export type ReferenceImageValidationResult = {
  images: ReferenceImageInput[];
  warnings: string[];
};

export function validateImageGenerationConfig(input: ImageGenerationConfigInput): ImageGenerationConfig {
  const errors: string[] = [];
  const size = input.size ?? "1024x1024";
  const quality = input.quality ?? "auto";
  const resolution = input.resolution ?? "1k";
  const outputFormat = input.outputFormat ?? "png";
  const timeoutMs = input.timeoutMs ?? DEFAULT_IMAGE_TIMEOUT_MS;
  const n = input.n ?? 1;

  if (!isMember(IMAGE_SIZES, size)) {
    errors.push(`size=${size}`);
  }

  if (!isMember(IMAGE_QUALITIES, quality)) {
    errors.push(`quality=${quality}`);
  }

  if (!isMember(IMAGE_RESOLUTIONS, resolution)) {
    errors.push(`resolution=${resolution}`);
  }

  if (!isMember(IMAGE_OUTPUT_FORMATS, outputFormat)) {
    errors.push(`outputFormat=${outputFormat}`);
  }

  if (!Number.isInteger(timeoutMs) || timeoutMs < 180_000) {
    errors.push(`timeoutMs=${timeoutMs}`);
  }

  if (!Number.isInteger(n) || n < 1 || n > 4) {
    errors.push(`n=${n}`);
  }

  if (errors.length > 0) {
    throw new Error(`Invalid image generation config: ${errors.join(", ")}`);
  }

  return {
    size: size as ImageSize,
    quality: quality as ImageQuality,
    resolution: resolution as ImageResolution,
    outputFormat: outputFormat as ImageOutputFormat,
    timeoutMs,
    n,
  };
}

export function validateReferenceImages(images: readonly ReferenceImageInput[] = []): ReferenceImageValidationResult {
  if (images.length > MAX_REFERENCE_IMAGES) {
    throw new Error("最多只能上传 8 张参考图。");
  }

  const warnings: string[] = [];
  if (images.length > RECOMMENDED_REFERENCE_IMAGES) {
    warnings.push("建议参考图不超过 4 张，过多图片可能降低稳定性。");
  }

  for (const image of images) {
    if (!image.mimeType.startsWith("image/")) {
      throw new Error(`Invalid reference image mime type: ${image.mimeType}`);
    }
  }

  return { images: [...images], warnings };
}

function isMember<const T extends readonly string[]>(values: T, value: string): value is T[number] {
  return values.includes(value);
}
