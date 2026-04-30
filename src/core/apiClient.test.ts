import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG, type AppConfig } from "./config";
import {
  buildChatCompletionsRequest,
  buildImageGenerationRequest,
  buildResponsesRequest,
  parseImageGenerationResponse,
  parseTextResponse,
  requestJsonWithTimeout,
} from "./apiClient";

describe("buildResponsesRequest", () => {
  it("builds a responses api payload from model and input", () => {
    expect(
      buildResponsesRequest({
        model: "gpt-5.4-mini",
        input: [
          { role: "system", content: "You are helpful." },
          { role: "user", content: "Write a haiku." },
        ],
      }),
    ).toEqual({
      model: "gpt-5.4-mini",
      input: [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Write a haiku." },
      ],
    });
  });
});

describe("buildChatCompletionsRequest", () => {
  it("builds a chat completions payload with system and user messages", () => {
    expect(
      buildChatCompletionsRequest({
        model: "gpt-4.1-mini",
        system: "You are helpful.",
        user: "Write a haiku.",
      }),
    ).toEqual({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Write a haiku." },
      ],
    });
  });
});

describe("buildImageGenerationRequest", () => {
  it("builds an image generation payload from explicit options", () => {
    expect(
      buildImageGenerationRequest({
        model: "gpt-image-2",
        prompt: "A cinematic skyline at dusk.",
        size: "1024x1024",
        quality: "high",
        n: 2,
        outputFormat: "webp",
      }),
    ).toEqual({
      model: "gpt-image-2",
      prompt: "A cinematic skyline at dusk.",
      size: "1024x1024",
      quality: "high",
      n: 2,
      output_format: "webp",
    });
  });
});

describe("parseTextResponse", () => {
  it("reads output_text from a responses api payload", () => {
    expect(
      parseTextResponse({
        output_text: "Optimized prompt text",
      }),
    ).toBe("Optimized prompt text");
  });

  it("falls back to chat completions message content", () => {
    expect(
      parseTextResponse({
        choices: [
          {
            message: {
              content: "Chat completion text",
            },
          },
        ],
      }),
    ).toBe("Chat completion text");
  });
});

describe("parseImageGenerationResponse", () => {
  it("parses base64 image payloads", () => {
    expect(
      parseImageGenerationResponse({
        data: [
          {
            b64_json: "YmFzZTY0LWRhdGE=",
            revised_prompt: "Refined prompt",
          },
        ],
      }),
    ).toEqual([
      {
        base64: "YmFzZTY0LWRhdGE=",
        revisedPrompt: "Refined prompt",
      },
    ]);
  });

  it("parses image url payloads", () => {
    expect(
      parseImageGenerationResponse({
        data: [
          {
            url: "https://example.com/image.png",
          },
        ],
      }),
    ).toEqual([
      {
        url: "https://example.com/image.png",
      },
    ]);
  });
});

describe("requestJsonWithTimeout", () => {
  const config: AppConfig = {
    ...DEFAULT_CONFIG,
    baseUrl: "https://api.example.com",
    apiKey: "sk-test",
    timeoutSeconds: 5,
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("aborts after the configured timeout", async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const requestPromise = requestJsonWithTimeout(config, {
      path: "/responses",
      body: { model: "gpt-5.4-mini", input: "hello" },
    });
    const rejection = expect(requestPromise).rejects.toThrow("Request timed out after 5 seconds.");

    await vi.advanceTimersByTimeAsync(5_000);

    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(requestUrl).toBe("https://api.example.com/v1/responses");
    expect(requestInit.method).toBe("POST");
    expect(requestInit.headers).toEqual({
      Authorization: "Bearer sk-test",
      "Content-Type": "application/json",
    });
    expect(requestInit.body).toBe(JSON.stringify({ model: "gpt-5.4-mini", input: "hello" }));

    vi.useRealTimers();
  });
});
