export type ImageQuality = "auto" | "low" | "medium" | "high";
export type ImageOutputFormat = "png" | "jpeg" | "webp";
export type ImageSizePresetCategory = "auto" | "1K" | "2K" | "4K" | "custom";
export type ImageSizePresetValue =
  | "auto"
  | "864x1536"
  | "1024x1024"
  | "1536x1024"
  | "1536x864"
  | "1024x1536"
  | "1152x2048"
  | "2048x2048"
  | "2048x1152"
  | "1360x2048"
  | "2048x1360"
  | "3840x2160"
  | "2160x3840"
  | "2304x3456"
  | "3456x2304"
  | "2880x2880";

export type ImageSizePreset = {
  value: ImageSizePresetValue;
  category: Exclude<ImageSizePresetCategory, "custom">;
};

export type ParsedImageSize = {
  width: number;
  height: number;
};

export type ImageSizeValidationResult = {
  error: string | null;
  warning: string | null;
};

const SIZE_MULTIPLE = 16;
const MAX_EDGE = 3840;
const MAX_ASPECT_RATIO = 3;
const MIN_TOTAL_PIXELS = 655_360;
const MAX_TOTAL_PIXELS = 8_294_400;
const HIGH_RESOLUTION_PIXELS = 2_560 * 1_440;

export const IMAGE_SIZE_PRESETS: ImageSizePreset[] = [
  { value: "auto", category: "auto" },
  { value: "864x1536", category: "1K" },
  { value: "1024x1024", category: "1K" },
  { value: "1024x1536", category: "1K" },
  { value: "1536x1024", category: "1K" },
  { value: "1536x864", category: "1K" },
  { value: "1152x2048", category: "2K" },
  { value: "1360x2048", category: "2K" },
  { value: "2048x2048", category: "2K" },
  { value: "2048x1152", category: "2K" },
  { value: "2048x1360", category: "2K" },
  { value: "2160x3840", category: "4K" },
  { value: "2304x3456", category: "4K" },
  { value: "2880x2880", category: "4K" },
  { value: "3840x2160", category: "4K" },
  { value: "3456x2304", category: "4K" },
];

const PRESET_VALUES = new Set<string>(IMAGE_SIZE_PRESETS.map((preset) => preset.value));
const IMAGE_QUALITY_VALUES = new Set<ImageQuality>(["auto", "low", "medium", "high"]);
const IMAGE_OUTPUT_FORMAT_VALUES = new Set<ImageOutputFormat>(["png", "jpeg", "webp"]);

export function parseImageSize(value: string): ParsedImageSize | null {
  const match = value.trim().match(/^(\d+)x(\d+)$/i);
  if (!match) {
    return null;
  }

  const width = Number(match[1]);
  const height = Number(match[2]);

  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    return null;
  }

  return { width, height };
}

export function isImageSizePreset(value: string): value is ImageSizePresetValue {
  return PRESET_VALUES.has(value.trim());
}

export function getImageSizePresetValue(value: string): ImageSizePresetValue | "custom" {
  const normalized = value.trim();
  return isImageSizePreset(normalized) ? normalized : "custom";
}

export function getImageSizePresetCategory(value: string): ImageSizePresetCategory {
  const preset = IMAGE_SIZE_PRESETS.find((item) => item.value === value.trim());
  return preset?.category ?? "custom";
}

export function isImageQuality(value: string): value is ImageQuality {
  return IMAGE_QUALITY_VALUES.has(value as ImageQuality);
}

export function isImageOutputFormat(value: string): value is ImageOutputFormat {
  return IMAGE_OUTPUT_FORMAT_VALUES.has(value as ImageOutputFormat);
}

export function isCompressionFormat(value: string): value is Extract<ImageOutputFormat, "jpeg" | "webp"> {
  return value === "jpeg" || value === "webp";
}

export function validateImageSize(value: string): ImageSizeValidationResult {
  const normalized = value.trim().toLowerCase();
  if (normalized === "auto") {
    return { error: null, warning: null };
  }

  const parsed = parseImageSize(normalized);
  if (!parsed) {
    return {
      error: "Image size must be auto or use WIDTHxHEIGHT format.",
      warning: null,
    };
  }

  const { width, height } = parsed;
  if (width % SIZE_MULTIPLE !== 0 || height % SIZE_MULTIPLE !== 0) {
    return {
      error: "Image size width and height must both be multiples of 16.",
      warning: null,
    };
  }

  if (width > MAX_EDGE || height > MAX_EDGE) {
    return {
      error: "Image size cannot exceed 3840 pixels on either edge.",
      warning: null,
    };
  }

  const ratio = Math.max(width / height, height / width);
  if (ratio > MAX_ASPECT_RATIO) {
    return {
      error: "Image size aspect ratio cannot exceed 3:1.",
      warning: null,
    };
  }

  const totalPixels = width * height;
  if (totalPixels < MIN_TOTAL_PIXELS || totalPixels > MAX_TOTAL_PIXELS) {
    return {
      error: "Image size must contain between 655,360 and 8,294,400 total pixels.",
      warning: null,
    };
  }

  return {
    error: null,
    warning:
      width * height >= HIGH_RESOLUTION_PIXELS
        ? "High-resolution sizes can take longer and may not be supported by every compatible provider."
        : null,
  };
}
