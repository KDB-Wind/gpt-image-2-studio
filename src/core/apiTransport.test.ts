import { afterEach, describe, expect, it, vi } from "vitest";
import { requestJsonWithTimeout, requestMultipartWithTimeout } from "./apiClient";
import { DEFAULT_CONFIG, mergeConfig } from "./config";
import { classifyBatchFailure } from "./batchRunner";
import { classifyErrorForUser } from "./errorClassifier";

const config = mergeConfig({
  ...DEFAULT_CONFIG,
  timeoutSeconds: 5,
  providerProfiles: [{
    ...DEFAULT_CONFIG.providerProfiles[0],
    baseUrl: "https://provider.example/v1",
    apiKey: "example-key",
  }],
});

const transports = [
  ["JSON", () => requestJsonWithTimeout(config, { path: "/images/generations", body: {} })],
  ["multipart", () => requestMultipartWithTimeout(config, { path: "/images/edits", body: new FormData() })],
] as const;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe.each(transports)("%s response body handling", (_name, request) => {
  it.each(["2", "Wed, 14 Oct 2026 00:00:02 GMT"])("reads a valid Retry-After header: %s", async (retryAfter) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-14T00:00:00Z"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 429, headers: { "Retry-After": retryAfter } })));
    await expect(request()).rejects.toMatchObject({ status: 429, retryAfterMs: 2_000 });
  });

  it("keeps the timeout active until the response body has finished", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | null | undefined;
    let finishBody!: (payload: unknown) => void;
    vi.stubGlobal("fetch", vi.fn(async (_url, init: RequestInit) => {
      signal = init.signal;
      return {
        ok: true,
        status: 200,
        json: () => new Promise((resolve, reject) => {
          finishBody = resolve;
          signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
      };
    }));

    const pending = request().then((payload) => ({ payload }), (error: unknown) => ({ error }));
    await vi.advanceTimersByTimeAsync(5_000);
    const aborted = signal?.aborted;
    finishBody({ data: [] });
    const result = await pending;

    expect(aborted).toBe(true);
    expect(result).toMatchObject({ error: { kind: "timeout", message: "Request timed out after 5 seconds." } });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("classifies malformed successful responses without exposing their contents", async () => {
    const privateDetail = "private-gateway-response";
    const fetchMock = vi.fn().mockResolvedValue(new Response(`<html>${privateDetail}</html>`, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const error = await request().catch((failure: unknown) => failure);
    expect(error).toMatchObject({ kind: "parse", status: 200 });
    expect((error as Error).message).not.toContain(privateDetail);
    expect(classifyErrorForUser(error)).toMatchObject({ kind: "provider", costWarning: true });
    expect(classifyBatchFailure(error)).toBe("cost_risk");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserves the distinction between a broken body connection and invalid JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => { throw new TypeError("Failed to fetch"); },
    }));
    await expect(request()).rejects.toMatchObject({ kind: "network" });
  });

  it("returns a valid payload and releases its timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"data":[]}', { status: 200 })));
    await expect(request()).resolves.toEqual({ data: [] });
    expect(vi.getTimerCount()).toBe(0);
  });
});
