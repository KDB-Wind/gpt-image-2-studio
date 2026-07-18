export type ImageDownloadFailureCode = "image-url-cors" | "image-url-base64-ignored" | "image-download-failed";
export type ImageResponseMode = "official" | "force-base64";
export type ImageDownloadOperation = "url" | "fetch" | "blob";

export class ImageDownloadError extends Error {
  readonly code: ImageDownloadFailureCode;

  constructor(code: ImageDownloadFailureCode) {
    super(getImageDownloadErrorMessage(code));
    this.name = "ImageDownloadError";
    this.code = code;
  }
}

export function isImageDownloadError(value: unknown): value is ImageDownloadError {
  return value instanceof ImageDownloadError;
}

export function classifyImageDownloadFailure(input: {
  responseMode: ImageResponseMode;
  cause: unknown;
  operation: ImageDownloadOperation;
  status?: number;
}): Error {
  if (input.responseMode === "force-base64") {
    return new ImageDownloadError("image-url-base64-ignored");
  }

  if (input.status !== undefined) {
    if (!isValidHttpStatus(input.status)) {
      return new ImageDownloadError("image-download-failed");
    }

    return new Error(`Failed to download generated image (HTTP ${input.status}).`);
  }

  if (input.operation === "fetch" && isBrowserFetchFailure(input.cause) && !isInvalidUrlFailure(input.cause)) {
    return new ImageDownloadError("image-url-cors");
  }

  return new ImageDownloadError("image-download-failed");
}

function getImageDownloadErrorMessage(code: ImageDownloadFailureCode): string {
  if (code === "image-url-base64-ignored") {
    return "The provider returned an image URL even though base64 image data was requested.";
  }

  if (code === "image-download-failed") {
    return "Failed to download generated image.";
  }

  return "The provider returned an image URL, but this browser could not download it. This is usually caused by CORS restrictions on the provider-hosted image. Use a provider or request mode that returns b64_json image data.";
}

function isBrowserFetchFailure(value: unknown): boolean {
  if (value instanceof TypeError) {
    return true;
  }

  if (value === null || typeof value !== "object") {
    return false;
  }

  const error = value as { name?: unknown; message?: unknown };
  return error.name === "TypeError" && typeof error.message === "string";
}

function isInvalidUrlFailure(value: unknown): boolean {
  if (value instanceof Error) {
    return /invalid url|failed to parse url|cannot parse url|not a valid url/i.test(value.message);
  }

  if (value === null || typeof value !== "object") {
    return false;
  }

  const error = value as { message?: unknown };
  return typeof error.message === "string"
    && /invalid url|failed to parse url|cannot parse url|not a valid url/i.test(error.message);
}

function isValidHttpStatus(value: number): boolean {
  return Number.isInteger(value) && value >= 100 && value <= 599;
}
