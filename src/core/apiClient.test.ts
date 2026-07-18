import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG, type AppConfig } from "./config";
import {
  buildChatCompletionsRequest,
  buildImageEditRequest,
  buildImageGenerationRequest,
  buildResponsesRequest,
  generateImages,
  optimizePrompt,
  parseImageGenerationResponse,
  parseTextResponse,
  requestJsonWithTimeout,
  testTextModel,
  sendTextRequest,
  testImageEditModel,
  testImageModel,
} from "./apiClient";

async function readPngDimensions(file: File): Promise<{ width: number; height: number }> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const header = String.fromCharCode(...bytes.slice(12, 16));

  if (bytes.length < 24 || header !== "IHDR") {
    throw new Error("Expected a PNG file with an IHDR chunk.");
  }

  const view = new DataView(buffer);
  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
  };
}

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

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
  it("forces one image even when a legacy caller requests more", () => {
    const payload = buildImageGenerationRequest({
      model: "gpt-image-2",
      prompt: "A cinematic skyline at dusk.",
      size: "1024x1024",
      quality: "high",
      n: 2,
      outputFormat: "webp",
      outputCompression: 85,
      responseMode: "official",
    });

    expect(payload).toEqual({
      model: "gpt-image-2",
      prompt: "A cinematic skyline at dusk.",
      size: "1024x1024",
      quality: "high",
      n: 1,
      output_format: "webp",
      output_compression: 85,
    });
  });

  it("adds b64_json only when force-base64 mode is explicit", () => {
    const payload = buildImageGenerationRequest({
      model: "gpt-image-2",
      prompt: "A cinematic skyline at dusk.",
      size: "1024x1024",
      quality: "high",
      n: 1,
      outputFormat: "png",
      outputCompression: 90,
      responseMode: "force-base64",
    });

    expect(payload.response_format).toBe("b64_json");
    expect(payload.output_format).toBe("png");
    expect(payload.output_compression).toBeUndefined();
  });

  it("builds an image generation payload from explicit options", () => {
    expect(
      buildImageGenerationRequest({
        model: "gpt-image-2",
        prompt: "A cinematic skyline at dusk.",
        size: "1024x1024",
        quality: "high",
        n: 2,
        outputFormat: "webp",
        outputCompression: 85,
        responseMode: "force-base64",
      }),
    ).toEqual({
      model: "gpt-image-2",
      prompt: "A cinematic skyline at dusk.",
      size: "1024x1024",
      quality: "high",
      n: 1,
      response_format: "b64_json",
      output_format: "webp",
      output_compression: 85,
    });
  });

  it("omits output_compression for png output", () => {
    expect(
      buildImageGenerationRequest({
        model: "gpt-image-2",
        prompt: "A cinematic skyline at dusk.",
        size: "1024x1024",
        quality: "high",
        n: 1,
        outputFormat: "png",
        outputCompression: 90,
        responseMode: "force-base64",
      }),
    ).toEqual({
      model: "gpt-image-2",
      prompt: "A cinematic skyline at dusk.",
      size: "1024x1024",
      quality: "high",
      n: 1,
      response_format: "b64_json",
      output_format: "png",
    });
  });
});

describe("buildImageEditRequest", () => {
  it("forces one edited image even when a legacy caller requests more", () => {
    const payload = buildImageEditRequest({
      model: "gpt-image-2",
      prompt: "Blend details from all references into one scene.",
      size: "1024x1024",
      quality: "high",
      n: 4,
      outputFormat: "png",
      outputCompression: 90,
      responseMode: "official",
      referenceImages: [new File(["one"], "one.png", { type: "image/png" })],
    });

    expect(payload.get("n")).toBe("1");
  });

  it("omits response_format in official mode while preserving compression and repeated image fields", () => {
    const payload = buildImageEditRequest({
      model: "gpt-image-2",
      prompt: "Blend details from all references into one scene.",
      size: "1024x1024",
      quality: "high",
      n: 1,
      outputFormat: "jpeg",
      outputCompression: 72,
      responseMode: "official",
      referenceImages: [
        new File(["one"], "one.png", { type: "image/png" }),
        new File(["two"], "two.png", { type: "image/png" }),
      ],
    });

    expect(payload.get("response_format")).toBeNull();
    expect(payload.get("output_format")).toBe("jpeg");
    expect(payload.get("output_compression")).toBe("72");
    expect(payload.getAll("image").map((item) => (item as File).name)).toEqual(["one.png", "two.png"]);
  });

  it("adds b64_json only when force-base64 mode is explicit", () => {
    const payload = buildImageEditRequest({
      model: "gpt-image-2",
      prompt: "Keep the subject and change the background.",
      size: "1024x1024",
      quality: "high",
      n: 1,
      outputFormat: "png",
      outputCompression: 90,
      responseMode: "force-base64",
      referenceImages: [new File(["reference"], "reference.png", { type: "image/png" })],
    });

    expect(payload.get("response_format")).toBe("b64_json");
    expect(payload.getAll("image")).toHaveLength(1);
  });

  it("builds a multipart image edit payload with a reference image", () => {
    const referenceImage = new File(["reference"], "reference.png", {
      type: "image/png",
    });

    const payload = buildImageEditRequest({
      model: "gpt-image-2",
      prompt: "Add warm studio lighting and keep the same subject.",
      size: "1024x1024",
      quality: "high",
      n: 1,
      outputFormat: "png",
      outputCompression: 90,
      responseMode: "force-base64",
      referenceImages: [referenceImage],
    });

    expect(payload.get("model")).toBe("gpt-image-2");
    expect(payload.get("prompt")).toBe("Add warm studio lighting and keep the same subject.");
    expect(payload.get("size")).toBe("1024x1024");
    expect(payload.get("quality")).toBe("high");
    expect(payload.get("n")).toBe("1");
    expect(payload.get("response_format")).toBe("b64_json");
    expect(payload.get("output_format")).toBe("png");
    expect(payload.has("output_compression")).toBe(false);

    expect(payload.getAll("image[]")).toHaveLength(0);

    const images = payload.getAll("image");
    expect(images).toHaveLength(1);
    expect(images[0]).toBeInstanceOf(File);
    expect((images[0] as File).name).toBe("reference.png");
  });

  it("appends multiple reference images under repeated image fields", () => {
    const payload = buildImageEditRequest({
      model: "gpt-image-2",
      prompt: "Blend details from all references into one scene.",
      size: "1024x1024",
      quality: "high",
      n: 1,
      outputFormat: "jpeg",
      outputCompression: 72,
      responseMode: "force-base64",
      referenceImages: [
        new File(["one"], "one.png", { type: "image/png" }),
        new File(["two"], "two.png", { type: "image/png" }),
        new File(["three"], "three.png", { type: "image/png" }),
      ],
    });

    expect(payload.get("response_format")).toBe("b64_json");
    expect(payload.get("output_compression")).toBe("72");
    expect(payload.getAll("image[]")).toHaveLength(0);
    expect(payload.getAll("image").map((item) => (item as File).name)).toEqual([
      "one.png",
      "two.png",
      "three.png",
    ]);
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

  it("combines multipart responses api content", () => {
    expect(
      parseTextResponse({
        output: [
          {
            content: [
              { type: "output_text", text: "First line." },
              { type: "output_text", text: "Second line." },
            ],
          },
          {
            content: [{ type: "output_text", text: "Third line." }],
          },
        ],
      }),
    ).toBe("First line.\nSecond line.\nThird line.");
  });

  it("ignores non-text response parts even when they expose a text field", () => {
    expect(
      parseTextResponse({
        output: [
          {
            content: [
              { type: "input_image", text: "ignore this" },
              { type: "output_text", text: "Keep this" },
            ],
          },
        ],
      }),
    ).toBe("Keep this");
  });

  it("ignores untyped response parts even when they expose a text field", () => {
    expect(
      parseTextResponse({
        output: [
          {
            content: [
              { text: "ignore this too" },
              { type: "output_text", text: "Keep this" },
            ],
          },
        ],
      }),
    ).toBe("Keep this");
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

  it("parses common OpenAI-compatible image field aliases", () => {
    expect(
      parseImageGenerationResponse({
        data: [
          {
            base64: "YWxpYXM=",
            image_url: "https://example.com/alias.png",
            revised_prompt: "Alias prompt",
          },
        ],
      }),
    ).toEqual([
      {
        base64: "YWxpYXM=",
        url: "https://example.com/alias.png",
        revisedPrompt: "Alias prompt",
      },
    ]);
  });

  it("surfaces structured provider errors from 200 payloads", () => {
    expect(() =>
      parseImageGenerationResponse({
        error: {
          message: "Upstream image worker returned no result.",
        },
      }),
    ).toThrow("Upstream image worker returned no result.");
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

  it("keeps provider response bodies out of the thrown public message", async () => {
    const secret = ["private", "provider", "token", "123456789"].join("-");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { message: `failed at https://provider.example/file?token=${secret}` } }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    let caught: unknown;
    try {
      await requestJsonWithTimeout(config, { path: "/images/generations", body: {} });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("Request failed with status 500.");
    expect((caught as Error).message).not.toContain(secret);
    expect((caught as Error).message).not.toContain("provider.example");
  });
});

describe("sendTextRequest", () => {
  const config: AppConfig = {
    ...DEFAULT_CONFIG,
    baseUrl: "https://api.example.com",
    apiKey: "sk-test",
    timeoutSeconds: 5,
    textModel: "gpt-5.4-mini",
  };

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("falls back to /chat/completions when /responses is unsupported", async () => {
    const fetchMock = vi
      .fn<(_: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "Unsupported endpoint" } }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "Fallback text" } }],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

    vi.stubGlobal("fetch", fetchMock);

    await expect(sendTextRequest(config, "system", "user")).resolves.toBe("Fallback text");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.example.com/v1/responses");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://api.example.com/v1/chat/completions");
  });

  it("does not fall back on timeout", async () => {
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

    const requestPromise = sendTextRequest(config, "system", "user");
    const rejection = expect(requestPromise).rejects.toThrow("Request timed out after 5 seconds.");

    await vi.advanceTimersByTimeAsync(5_000);

    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.example.com/v1/responses");
  });

  it("does not fall back on non-unsupported http errors", async () => {
    const fetchMock = vi
      .fn<(_: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "Invalid API key" } }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    await expect(sendTextRequest(config, "system", "user")).rejects.toThrow("Request failed with status 401");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.example.com/v1/responses");
  });

  it("does not fall back on model-not-found style 404 errors", async () => {
    const fetchMock = vi
      .fn<(_: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "Model gpt-5.4-mini not found" } }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    await expect(sendTextRequest(config, "system", "user")).rejects.toThrow("Request failed with status 404");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.example.com/v1/responses");
  });

  it("does not fall back on unsupported model errors", async () => {
    const fetchMock = vi
      .fn<(_: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "Unsupported model gpt-5.4-mini" } }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    await expect(sendTextRequest(config, "system", "user")).rejects.toThrow("Request failed with status 404");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.example.com/v1/responses");
  });

  it("does not fall back on a generic unsupported response", async () => {
    const fetchMock = vi
      .fn<(_: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "Unsupported" } }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    await expect(sendTextRequest(config, "system", "user")).rejects.toThrow("Request failed with status 404");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.example.com/v1/responses");
  });

  it("does not fall back on model-scoped not-implemented errors", async () => {
    const fetchMock = vi
      .fn<(_: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "Not implemented for this model" } }), {
          status: 501,
          headers: { "Content-Type": "application/json" },
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    await expect(sendTextRequest(config, "system", "user")).rejects.toThrow("Request failed with status 501");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.example.com/v1/responses");
  });
});

describe("testImageModel", () => {
  const config: AppConfig = {
    ...DEFAULT_CONFIG,
    baseUrl: "https://api.example.com",
    apiKey: "sk-test",
    timeoutSeconds: 5,
    imageModel: "gpt-image-1",
    defaultSize: "1024x1024",
    defaultQuality: "medium",
    defaultCount: 1,
    defaultFormat: "png",
    defaultCompression: 90,
    imageResponseMode: "force-base64",
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("delegates to the image generation endpoint with a minimal swatch prompt", async () => {
    const fetchMock = vi
      .fn<(_: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ b64_json: "YmFzZTY0LXN3YXRjaA==" }],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

    vi.stubGlobal("fetch", fetchMock);

    await expect(testImageModel(config)).resolves.toEqual([{ base64: "YmFzZTY0LXN3YXRjaA==" }]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(requestUrl).toBe("https://api.example.com/v1/images/generations");
    expect(JSON.parse(requestInit.body as string)).toEqual({
      model: "gpt-image-1",
      prompt: "A plain single-color square swatch image.",
      size: "1024x1024",
      quality: "medium",
      n: 1,
      output_format: "png",
      response_format: "b64_json",
    });
  });
});

describe("generateImages", () => {
  const config: AppConfig = {
    ...DEFAULT_CONFIG,
    baseUrl: "https://api.example.com",
    apiKey: "sk-test",
    timeoutSeconds: 5,
    imageModel: "gpt-image-2",
    defaultSize: "1024x1024",
    defaultQuality: "high",
    defaultCount: 1,
    defaultFormat: "png",
    defaultCompression: 90,
    imageResponseMode: "force-base64",
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends one image for a single task even with a legacy count", async () => {
    const fetchMock = vi
      .fn<(_: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ b64_json: "b2s=" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await generateImages({ ...config, defaultCount: 4 }, "One image only.");

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(requestInit.body as string).n).toBe(1);
  });

  it("uses the image edit endpoint when a reference image is provided", async () => {
    const fetchMock = vi
      .fn<(_: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ b64_json: "YmFzZTY0LWVkaXQ=" }],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

    vi.stubGlobal("fetch", fetchMock);

    const referenceImage = new File(["reference"], "reference.png", {
      type: "image/png",
    });

    await expect(
      generateImages(config, "Turn this into a bright watercolor poster.", {
        referenceImages: [referenceImage],
      }),
    ).resolves.toEqual([{ base64: "YmFzZTY0LWVkaXQ=" }]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(requestUrl).toBe("https://api.example.com/v1/images/edits");
    expect(requestInit.headers).toEqual({
      Authorization: "Bearer sk-test",
    });
    expect(requestInit.body).toBeInstanceOf(FormData);

    const formData = requestInit.body as FormData;
    expect(formData.get("model")).toBe("gpt-image-2");
    expect(formData.get("prompt")).toBe("Turn this into a bright watercolor poster.");
    expect(formData.get("response_format")).toBe("b64_json");
    expect(formData.getAll("image[]")).toHaveLength(0);
    expect(formData.getAll("image")).toHaveLength(1);
  });
});

describe("active provider request resolution", () => {
  const config = {
    ...DEFAULT_CONFIG,
    baseUrl: "https://stale.example/v1",
    apiKey: "stale-key",
    textModel: "stale-text",
    imageModel: "stale-image",
    imageResponseMode: "official" as const,
    providerSchemaVersion: 1 as const,
    activeProviderProfileId: "profile-b",
    providerProfiles: [
      {
        id: "profile-a",
        name: "Profile A",
        baseUrl: "https://a.example/v1",
        apiKey: "key-a",
        textModel: "text-a",
        imageModel: "image-a",
        imageResponseMode: "official" as const,
        rememberApiKey: true,
      },
      {
        id: "profile-b",
        name: "Profile B",
        baseUrl: "https://b.example/v1",
        apiKey: "key-b",
        textModel: "text-b",
        imageModel: "image-b",
        imageResponseMode: "force-base64" as const,
        rememberApiKey: true,
      },
    ],
  } satisfies AppConfig;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the active profile for text, optimize, generation, edit, and model tests", async () => {
    const fetchMock = vi.fn<(_: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ output_text: "text" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ output_text: "optimized" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ b64_json: "gen" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ b64_json: "edit" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ output_text: "tested" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendTextRequest(config, "system", "user");
    await optimizePrompt(config, "prompt");
    await generateImages(config, "generate");
    await generateImages(config, "edit", { referenceImages: [new File(["ref"], "ref.png")] });
    await testTextModel(config);

    expect(fetchMock).toHaveBeenCalledTimes(5);
    for (const call of fetchMock.mock.calls) {
      expect(call[0]).toContain("https://b.example/v1/");
      expect((call[1]?.headers as Record<string, string>).Authorization).toBe("Bearer key-b");
    }
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string).model).toBe("text-b");
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string).model).toBe("text-b");
    expect(JSON.parse(fetchMock.mock.calls[2][1]?.body as string)).toEqual(expect.objectContaining({
      model: "image-b",
      response_format: "b64_json",
    }));
    expect((fetchMock.mock.calls[3][1]?.body as FormData).get("model")).toBe("image-b");
    expect((fetchMock.mock.calls[3][1]?.body as FormData).get("response_format")).toBe("b64_json");
    expect(JSON.parse(fetchMock.mock.calls[4][1]?.body as string).model).toBe("text-b");
  });

  it("omits response_format when the active profile uses official image responses", async () => {
    const fetchMock = vi.fn<(_: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValue(new Response(JSON.stringify({ data: [{ url: "https://image.example/result" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await generateImages({
      ...config,
      activeProviderProfileId: "profile-a",
    }, "generate");

    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(fetchMock.mock.calls[0][0]).toContain("https://a.example/v1/");
    expect(body.model).toBe("image-a");
    expect(body.response_format).toBeUndefined();
  });
});

describe("testImageEditModel", () => {
  const config: AppConfig = {
    ...DEFAULT_CONFIG,
    baseUrl: "https://api.example.com",
    apiKey: "sk-test",
    timeoutSeconds: 5,
    imageModel: "gpt-image-2",
    defaultSize: "1024x1024",
    defaultQuality: "high",
    defaultCount: 1,
    defaultFormat: "png",
    defaultCompression: 90,
    imageResponseMode: "force-base64",
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses a bundled reference image to verify image-to-image connectivity", async () => {
    const fetchMock = vi
      .fn<(_: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ b64_json: "YmFzZTY0LWVkaXQtdGVzdA==" }],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

    vi.stubGlobal("fetch", fetchMock);

    await expect(testImageEditModel(config)).resolves.toEqual([{ base64: "YmFzZTY0LWVkaXQtdGVzdA==" }]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(requestUrl).toBe("https://api.example.com/v1/images/edits");
    expect(requestInit.body).toBeInstanceOf(FormData);

    const formData = requestInit.body as FormData;
    expect(formData.get("prompt")).toBe("Apply a minimal visible edit for a connectivity test.");
    expect(formData.get("response_format")).toBe("b64_json");
    expect(formData.getAll("image[]")).toHaveLength(0);
    const images = formData.getAll("image");
    expect(images).toHaveLength(1);
    expect(images[0]).toBeInstanceOf(File);
    expect((images[0] as File).name).toBe("connectivity-reference.png");
  });

  it("uses a reference image that is larger than 1x1 so providers do not reject it as invalid", async () => {
    const fetchMock = vi
      .fn<(_: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ b64_json: "YmFzZTY0LWVkaXQtdGVzdA==" }],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

    vi.stubGlobal("fetch", fetchMock);

    await testImageEditModel(config);

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const formData = requestInit.body as FormData;
    expect(formData.get("response_format")).toBe("b64_json");
    expect(formData.getAll("image[]")).toHaveLength(0);
    const image = formData.getAll("image")[0] as File;
    const dimensions = await readPngDimensions(image);

    expect(dimensions).toEqual({ width: 64, height: 64 });
    expect(await sha256(image)).toBe("94b6945b039def1bb3e406e6e22fd82c8278419eb411a150f2f8da65c9816e23");
  });
});
