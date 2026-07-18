import { describe, expect, it } from "vitest";
import {
  classifyImageDownloadFailure,
  ImageDownloadError,
  isImageDownloadError,
} from "./imageDownloadError";

describe("image download error classification", () => {
  it("classifies a browser fetch TypeError as a CORS failure without retaining its details", () => {
    const providerUrl = "https://provider.example/image.png?signature=private-token";
    const error = classifyImageDownloadFailure({
      responseMode: "official",
      cause: new TypeError(`Failed to fetch ${providerUrl}`),
      operation: "fetch",
    });

    expect(error).toBeInstanceOf(ImageDownloadError);
    expect(error).toMatchObject({ code: "image-url-cors" });
    expect(error.message).not.toContain(providerUrl);
    expect(error.message).not.toContain("private-token");
  });

  it("keeps HTTP failures generic", () => {
    const error = classifyImageDownloadFailure({
      responseMode: "official",
      status: 403,
      cause: new Error("Forbidden response body contains a provider secret"),
      operation: "fetch",
    });

    expect(isImageDownloadError(error)).toBe(false);
    expect(error.message).toBe("Failed to download generated image (HTTP 403).");
    expect(error.message).not.toContain("provider secret");
  });

  it("classifies a URL returned in force-base64 mode separately", () => {
    const error = classifyImageDownloadFailure({
      responseMode: "force-base64",
      cause: new Error("The provider returned a URL instead of b64_json."),
      operation: "url",
    });

    expect(error).toMatchObject({ code: "image-url-base64-ignored" });
    expect(error.message).not.toContain("force-base64");
    expect(error.message).not.toContain("b64_json");
  });

  it("keeps unrelated download failures generic", () => {
    const error = classifyImageDownloadFailure({
      responseMode: "official",
      cause: new Error("Blob conversion failed with a private response body"),
      operation: "blob",
    });

    expect(isImageDownloadError(error)).toBe(true);
    expect(error).toMatchObject({ code: "image-download-failed" });
    expect(error.message).toBe("Failed to download generated image.");
  });

  it("keeps invalid fetch URLs generic", () => {
    const error = classifyImageDownloadFailure({
      responseMode: "official",
      cause: new TypeError("Failed to parse URL from https://invalid-url"),
      operation: "fetch",
    });

    expect(error).toMatchObject({ code: "image-download-failed" });
    expect(error.message).not.toContain("invalid-url");
  });

  it("keeps blob parsing failures generic even when the browser reports TypeError", () => {
    const error = classifyImageDownloadFailure({
      responseMode: "official",
      cause: new TypeError("Response body stream failed for https://provider.example/image.png"),
      operation: "blob",
    });

    expect(error).toMatchObject({ code: "image-download-failed" });
    expect(error.message).not.toContain("provider.example");
  });

  it.each([-1, 0, 99, 600, NaN, Infinity])("uses a generic failure for invalid HTTP status %s", (status) => {
    const error = classifyImageDownloadFailure({
      responseMode: "official",
      cause: new Error("private response details"),
      operation: "fetch",
      status,
    });

    expect(error).toMatchObject({ code: "image-download-failed" });
    expect(error.message).toBe("Failed to download generated image.");
    expect(error.message).not.toContain(String(status));
  });
});
