import {
  validateImageGenerationConfig,
  validateReferenceImages,
  type ImageGenerationConfigInput,
  type ReferenceImageInput,
} from "@chat-to-image/image-config";
import {
  classifyProviderError,
  type ProviderErrorClassification,
  type ProviderErrorInput,
} from "@chat-to-image/platform-core";

export type ProviderImage = {
  base64?: string;
  url?: string;
  revisedPrompt?: string;
};

export type ProviderImageResultFile = {
  storagePath: string;
  mimeType: string;
  bytes: number;
  width?: number | null;
  height?: number | null;
};

export type OpenAIImageProviderInput = ImageGenerationConfigInput & {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  referenceImages?: ReferenceImageInput[];
};

export type OpenAIImageProviderResult = {
  images: ProviderImage[];
  warnings: string[];
  raw: unknown;
};

export type FetchLike = (url: string | URL, init?: RequestInit) => Promise<Response>;

export type OpenAIImageProviderDependencies = {
  fetch?: FetchLike;
};

export class ProviderImageError extends Error {
  classification: ProviderErrorClassification;
  status?: number;
  responseBody?: string;
  payload?: unknown;

  constructor(
    message: string,
    options: {
      classification: ProviderErrorClassification;
      status?: number;
      responseBody?: string;
      payload?: unknown;
    },
  ) {
    super(message);
    this.name = "ProviderImageError";
    this.classification = options.classification;
    this.status = options.status;
    this.responseBody = options.responseBody;
    this.payload = options.payload;
  }
}

export async function callOpenAIImageProvider(
  input: OpenAIImageProviderInput,
  deps: OpenAIImageProviderDependencies = {},
): Promise<OpenAIImageProviderResult> {
  const config = validateImageGenerationConfig(input);
  const referenceImages = validateReferenceImages(input.referenceImages ?? []);
  const fetchImpl = deps.fetch ?? globalThis.fetch;

  if (!fetchImpl) {
    throw new Error("No fetch implementation is available.");
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, config.timeoutMs);

  try {
    const isEdit = referenceImages.images.length > 0;
    const response = await fetchImpl(`${normalizeBaseUrl(input.baseUrl)}${isEdit ? "/images/edits" : "/images/generations"}`, {
      method: "POST",
      headers: buildHeaders(input.apiKey, isEdit),
      body: isEdit
        ? buildImageEditFormData(input, config, referenceImages.images)
        : JSON.stringify(buildImageGenerationBody(input, config)),
      signal: controller.signal,
    });

    if (!response.ok) {
      const responseBody = await readResponseText(response);
      throw createProviderImageError(`Request failed with status ${response.status}${responseBody ? `: ${responseBody}` : ""}`, {
        status: response.status,
        responseBody,
        payload: parseJsonOrNull(responseBody),
        kind: "http",
      });
    }

    const payload = await response.json();
    const images = parseImageResponse(payload);

    return {
      images,
      warnings: referenceImages.warnings,
      raw: payload,
    };
  } catch (error) {
    if (error instanceof ProviderImageError) {
      throw error;
    }

    if (timedOut || isAbortError(error)) {
      throw createProviderImageError(`Provider request timed out after ${config.timeoutMs}ms.`, { kind: "timeout" });
    }

    throw createProviderImageError(error instanceof Error ? error.message : "Provider request failed.", {
      kind: "network",
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export function buildImageGenerationBody(input: OpenAIImageProviderInput, config = validateImageGenerationConfig(input)) {
  return {
    model: input.model,
    prompt: input.prompt,
    size: config.size,
    quality: config.quality,
    resolution: config.resolution,
    n: config.n,
    output_format: config.outputFormat,
  };
}

export function buildImageEditFormData(
  input: OpenAIImageProviderInput,
  config = validateImageGenerationConfig(input),
  referenceImages = validateReferenceImages(input.referenceImages ?? []).images,
): FormData {
  const form = new FormData();
  form.set("model", input.model);
  form.set("prompt", input.prompt);
  form.set("size", config.size);
  form.set("quality", config.quality);
  form.set("resolution", config.resolution);
  form.set("n", String(config.n));
  form.set("output_format", config.outputFormat);

  referenceImages.forEach((image, index) => {
    form.append("image", toBlob(image), image.filename ?? `reference-${index + 1}.${extensionFromMimeType(image.mimeType)}`);
  });

  return form;
}

export function parseImageResponse(payload: unknown): ProviderImage[] {
  const record = asRecord(payload);
  const data = Array.isArray(record.data) ? record.data : [];
  const images = data
    .map((entry) => {
      const item = asRecord(entry);
      const base64 = asString(item.b64_json);
      const url = asString(item.url);
      const revisedPrompt = asString(item.revised_prompt);
      const image: ProviderImage = {};

      if (base64) {
        image.base64 = base64;
      }

      if (url) {
        image.url = url;
      }

      if (revisedPrompt) {
        image.revisedPrompt = revisedPrompt;
      }

      return image.base64 || image.url ? image : null;
    })
    .filter((image): image is ProviderImage => image !== null);

  if (images.length === 0) {
    throw createProviderImageError("Image generation response did not contain any image data.", {
      status: 200,
      payload,
      message: "Image generation response did not contain any image data.",
      kind: "parse",
    });
  }

  return images;
}

function buildHeaders(apiKey: string, isMultipart: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
  };

  if (!isMultipart) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

function createProviderImageError(
  message: string,
  input: ProviderErrorInput,
): ProviderImageError {
  const payloadRecord = asRecord(input.payload);
  const errorRecord = asRecord(payloadRecord.error);
  const classification = classifyProviderError({
    ...input,
    message: input.message ?? message,
    code: input.code ?? asString(errorRecord.code),
    type: input.type ?? asString(errorRecord.type),
  });

  return new ProviderImageError(message, {
    classification,
    status: input.status,
    responseBody: input.responseBody,
    payload: input.payload,
  });
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

function toBlob(image: ReferenceImageInput): Blob {
  const bytes = toArrayBuffer(image.data);
  return new Blob([bytes], { type: image.mimeType });
}

function toArrayBuffer(data: ReferenceImageInput["data"]): ArrayBuffer {
  if (typeof data === "string") {
    return copyBytes(Buffer.from(data, "base64"));
  }

  if (data instanceof ArrayBuffer) {
    return data;
  }

  return copyBytes(data);
}

function copyBytes(bytes: ArrayLike<number>): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) {
    copy[index] = bytes[index] ?? 0;
  }
  return copy.buffer;
}

function extensionFromMimeType(mimeType: string): string {
  if (mimeType === "image/jpeg") {
    return "jpg";
  }

  const [, subtype = "png"] = mimeType.split("/");
  return subtype.replace(/[^a-z0-9]/gi, "") || "png";
}

async function readResponseText(response: Response): Promise<string> {
  try {
    return (await response.text()).trim();
  } catch {
    return "";
  }
}

function parseJsonOrNull(value: string): unknown | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : asRecord(error).name === "AbortError";
}
