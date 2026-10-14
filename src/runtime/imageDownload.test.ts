import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "../core/config";
import { webAdapter, __resetWebAdapterForTests } from "./webAdapter";
import type { RuntimeAdapter, SaveImageInput } from "./types";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
  invoke: async () => ({ id: "saved", outputPath: "outputs/image.png" }),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openPath: vi.fn() }));

import { tauriAdapter } from "./tauriAdapter";

const input: SaveImageInput = {
  image: { url: "https://provider.example/image.png?signature=private-token" },
  prompt: "Download test", optimizedPrompt: "", customName: "",
  config: { ...DEFAULT_CONFIG, timeoutSeconds: 5 }, generatedAt: new Date(), durationMs: 1,
};

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); __resetWebAdapterForTests();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:download-test");
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe.each<[string, RuntimeAdapter]>([["web", webAdapter], ["desktop", tauriAdapter]])("%s image downloads", (_name, adapter) => {
  it.each(["headers", "body"])("bounds the %s phase and keeps signed URLs out of timeout errors", async (phase) => {
    vi.useFakeTimers();
    let signal: AbortSignal | null | undefined;
    let finish!: () => void;
    vi.stubGlobal("fetch", vi.fn(async (_url, init?: RequestInit) => {
      signal = init?.signal;
      if (phase === "headers") {
        return new Promise((_resolve, reject) => {
          finish = () => reject(new Error("Test cleanup"));
          signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        });
      }
      return {
        ok: true,
        blob: () => new Promise((_resolve, reject) => {
          finish = () => reject(new Error("Test cleanup"));
          signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
      };
    }));
    const pending = adapter.saveImage(input).then(() => null, (error: Error) => error);
    await vi.advanceTimersByTimeAsync(5_000);
    const aborted = signal?.aborted;
    finish();
    const error = await pending;
    expect(aborted).toBe(true);
    expect(error).toMatchObject({ code: "image-download-timeout", kind: "timeout" });
    expect(error?.message).not.toContain("private-token");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("honors force-base64 without downloading a provider URL", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(adapter.saveImage({ ...input, config: {
      ...input.config, providerProfiles: [{ ...DEFAULT_CONFIG.providerProfiles[0], imageResponseMode: "force-base64" }],
    } })).rejects.toMatchObject({ code: "image-url-base64-ignored" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["text/html", "application/json"])("does not save a %s gateway response as an image", async (type) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("gateway-error", { status: 200, headers: { "Content-Type": type } })));
    await expect(adapter.saveImage(input)).rejects.toMatchObject({ code: "image-download-failed" });
  });
});
