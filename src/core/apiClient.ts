import { normalizeBaseUrl, type AppConfig } from "./config";

export type TextRequestInput = {
  model: string;
  input: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
};

export type ChatRequestInput = {
  model: string;
  system: string;
  user: string;
};

export type ImageRequestInput = {
  model: string;
  prompt: string;
  size: string;
  quality: string;
  n: number;
  outputFormat: "png" | "jpeg" | "webp";
};

export type ParsedImage = {
  base64?: string;
  url?: string;
  revisedPrompt?: string;
};

export type RequestJsonInput = {
  path: string;
  body: unknown;
};

type ApiClientErrorKind = "timeout" | "http" | "network";

type ChatMessageContentPart = {
  type?: string;
  text?: string;
};

type JsonRecord = Record<string, unknown>;

class ApiClientError extends Error {
  kind: ApiClientErrorKind;
  status?: number;
  responseBody?: string;

  constructor(message: string, options: { kind: ApiClientErrorKind; status?: number; responseBody?: string }) {
    super(message);
    this.name = "ApiClientError";
    this.kind = options.kind;
    this.status = options.status;
    this.responseBody = options.responseBody;
  }
}

export function buildResponsesRequest({ model, input }: TextRequestInput) {
  return { model, input };
}

export function buildChatCompletionsRequest({ model, system, user }: ChatRequestInput) {
  return {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
}

export function buildImageGenerationRequest({
  model,
  prompt,
  size,
  quality,
  n,
  outputFormat,
}: ImageRequestInput) {
  return {
    model,
    prompt,
    size,
    quality,
    n,
    output_format: outputFormat,
  };
}

export function parseTextResponse(payload: unknown): string {
  const record = asRecord(payload);
  const outputText = asString(record.output_text);

  if (outputText) {
    return outputText;
  }

  const output = Array.isArray(record.output) ? record.output : [];
  const responseSegments: string[] = [];
  for (const item of output) {
    const itemRecord = asRecord(item);
    const content = Array.isArray(itemRecord.content) ? itemRecord.content : [];

    for (const part of content) {
      const text = readChatContentPart(asRecord(part));
      if (text) {
        responseSegments.push(text);
      }
    }
  }

  if (responseSegments.length > 0) {
    return responseSegments.join("\n");
  }

  const choices = Array.isArray(record.choices) ? record.choices : [];
  const firstChoice = asRecord(choices[0]);
  const message = asRecord(firstChoice.message);
  const content = message.content;

  if (typeof content === "string" && content) {
    return content;
  }

  if (Array.isArray(content)) {
    const combined = content
      .map((part) => readChatContentPart(asRecord(part)))
      .filter(Boolean)
      .join("\n")
      .trim();

    if (combined) {
      return combined;
    }
  }

  throw new Error("Text response did not contain any readable content.");
}

export function parseImageGenerationResponse(payload: unknown): ParsedImage[] {
  const record = asRecord(payload);
  const data = Array.isArray(record.data) ? record.data : [];
  const images = data
    .map((entry) => {
      const item = asRecord(entry);
      const parsed: ParsedImage = {};
      const base64 = asString(item.b64_json);
      const url = asString(item.url);
      const revisedPrompt = asString(item.revised_prompt);

      if (base64) {
        parsed.base64 = base64;
      }

      if (url) {
        parsed.url = url;
      }

      if (revisedPrompt) {
        parsed.revisedPrompt = revisedPrompt;
      }

      return parsed.base64 || parsed.url ? parsed : null;
    })
    .filter((item): item is ParsedImage => item !== null);

  if (images.length > 0) {
    return images;
  }

  throw new Error("Image generation response did not contain any image data.");
}

export async function requestJsonWithTimeout(config: AppConfig, { path, body }: RequestJsonInput) {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutMs = config.timeoutSeconds * 1_000;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(`${normalizeBaseUrl(config.baseUrl)}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const details = await readResponseText(response);
      const suffix = details ? `: ${details}` : "";
      throw new ApiClientError(`Request failed with status ${response.status}${suffix}`, {
        kind: "http",
        status: response.status,
        responseBody: details,
      });
    }

    return response.json();
  } catch (error) {
    if (timedOut || isAbortError(error)) {
      throw new ApiClientError(`Request timed out after ${config.timeoutSeconds} seconds.`, {
        kind: "timeout",
      });
    }

    if (error instanceof ApiClientError) {
      throw error;
    }

    throw new ApiClientError(error instanceof Error ? error.message : "Request failed.", {
      kind: "network",
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function sendTextRequest(config: AppConfig, system: string, user: string): Promise<string> {
  try {
    const responsesPayload = await requestJsonWithTimeout(config, {
      path: "/responses",
      body: buildResponsesRequest({
        model: config.textModel,
        input: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    return parseTextResponse(responsesPayload);
  } catch (error) {
    if (!shouldFallbackToChatCompletions(error)) {
      throw error;
    }

    const chatPayload = await requestJsonWithTimeout(config, {
      path: "/chat/completions",
      body: buildChatCompletionsRequest({
        model: config.textModel,
        system,
        user,
      }),
    });

    return parseTextResponse(chatPayload);
  }
}

export function testTextModel(config: AppConfig): Promise<string> {
  return sendTextRequest(
    config,
    "You are a connectivity test assistant. Reply with a short confirmation.",
    "Reply with OK.",
  );
}

export function optimizePrompt(config: AppConfig, prompt: string): Promise<string> {
  return sendTextRequest(
    config,
    "You improve image generation prompts. Return only the revised prompt.",
    prompt,
  );
}

export async function generateImages(config: AppConfig, prompt: string): Promise<ParsedImage[]> {
  const payload = await requestJsonWithTimeout(config, {
    path: "/images/generations",
    body: buildImageGenerationRequest({
      model: config.imageModel,
      prompt,
      size: config.defaultSize,
      quality: config.defaultQuality,
      n: config.defaultCount,
      outputFormat: config.defaultFormat,
    }),
  });

  return parseImageGenerationResponse(payload);
}

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" ? (value as JsonRecord) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readChatContentPart(part: ChatMessageContentPart): string {
  if (part.type === "output_text" || part.type === "text") {
    return asString(part.text);
  }

  return "";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : asRecord(error).name === "AbortError";
}

function shouldFallbackToChatCompletions(error: unknown): boolean {
  if (!(error instanceof ApiClientError) || error.kind !== "http") {
    return false;
  }

  if (error.status !== 404 && error.status !== 405 && error.status !== 501) {
    return false;
  }

  const haystack = `${error.message}\n${error.responseBody ?? ""}`.toLowerCase();
  return haystack.includes("unsupported endpoint")
    || haystack.includes("unsupported route")
    || haystack.includes("unsupported path")
    || haystack.includes("unknown endpoint")
    || haystack.includes("unknown route")
    || haystack.includes("unknown path")
    || haystack.includes("endpoint not implemented")
    || haystack.includes("route not implemented")
    || haystack.includes("path not implemented")
    || haystack.includes("method not allowed")
    || haystack.includes("no route");
}

async function readResponseText(response: Response): Promise<string> {
  try {
    return (await response.text()).trim();
  } catch {
    return "";
  }
}
