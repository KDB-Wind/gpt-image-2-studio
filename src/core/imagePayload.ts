import type { ParsedImage } from "./apiClient";
import type { AppConfig } from "./config";
import { classifyImageDownloadFailure, ImageDownloadError } from "./imageDownloadError";
import { resolveActiveProviderProfile } from "./providerProfiles";

export function decodeBase64Image(base64: string, format: AppConfig["defaultFormat"]): Blob {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: format === "jpeg" ? "image/jpeg" : `image/${format}` });
}

export async function resolveImageBlob(image: ParsedImage, config: AppConfig): Promise<Blob> {
  if (image.base64) return decodeBase64Image(image.base64, config.defaultFormat);
  if (!image.url) throw new Error("Image payload did not include base64 data or a URL.");

  const responseMode = resolveActiveProviderProfile(config.providerProfiles, config.activeProviderProfileId).imageResponseMode;
  const parsedUrl = parseSupportedImageUrl(image.url);
  if (!parsedUrl) throw new ImageDownloadError("image-download-failed");
  if (responseMode === "force-base64") throw new ImageDownloadError("image-url-base64-ignored");

  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, config.timeoutSeconds * 1_000);
  try {
    let response: Response;
    try {
      // Returned image URLs never inherit the provider Authorization header.
      response = await fetch(image.url, { signal: controller.signal });
    } catch (cause) {
      if (timedOut) throw new ImageDownloadError("image-download-timeout");
      throw classifyImageDownloadFailure({ responseMode, cause, operation: "fetch", urlProtocol: parsedUrl.protocol });
    }
    if (!response.ok) {
      throw classifyImageDownloadFailure({ responseMode, cause: undefined, operation: "fetch", status: response.status });
    }
    let blob: Blob;
    try {
      blob = await response.blob();
    } catch (cause) {
      if (timedOut) throw new ImageDownloadError("image-download-timeout");
      throw classifyImageDownloadFailure({ responseMode, cause, operation: "blob" });
    }
    if (!blob.size || blob.type.startsWith("text/") || /(?:json|html)/i.test(blob.type)) {
      throw new ImageDownloadError("image-download-failed");
    }
    return blob;
  } finally {
    clearTimeout(timeout);
  }
}

function parseSupportedImageUrl(value: string): URL | null {
  try {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? new URL(trimmed) : new URL(trimmed, window.location.href);
    const supported = ((parsed.protocol === "http:" || parsed.protocol === "https:") && Boolean(parsed.hostname))
      || parsed.protocol === "blob:" || parsed.protocol === "data:";
    return supported ? parsed : null;
  } catch {
    return null;
  }
}
