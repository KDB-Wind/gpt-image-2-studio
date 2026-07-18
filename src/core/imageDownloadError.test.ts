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
    });

    expect(isImageDownloadError(error)).toBe(false);
    expect(error.message).toBe("Failed to download generated image (HTTP 403).");
    expect(error.message).not.toContain("provider secret");
  });

  it("classifies a URL returned in force-base64 mode separately", () => {
    const error = classifyImageDownloadFailure({
      responseMode: "force-base64",
      cause: new Error("The provider returned a URL instead of b64_json."),
    });

    expect(error).toMatchObject({ code: "image-url-base64-ignored" });
    expect(error.message).not.toContain("force-base64");
    expect(error.message).not.toContain("b64_json");
  });

  it("keeps unrelated download failures generic", () => {
    const error = classifyImageDownloadFailure({
      responseMode: "official",
      cause: new Error("Blob conversion failed with a private response body"),
    });

    expect(isImageDownloadError(error)).toBe(false);
    expect(error.message).toBe("Failed to download generated image.");
  });
});
