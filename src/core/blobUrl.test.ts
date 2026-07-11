import { describe, expect, it, vi } from "vitest";

import { revokeBlobUrl } from "./blobUrl";

describe("revokeBlobUrl", () => {
  it("revokes blob URLs but leaves non-blob URLs untouched", () => {
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    revokeBlobUrl("blob:generated-image");
    revokeBlobUrl("https://example.com/generated-image.png");
    revokeBlobUrl("http://example.com/generated-image.png");
    revokeBlobUrl("data:image/png;base64,abc");
    revokeBlobUrl();

    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:generated-image");

    revokeObjectUrl.mockRestore();
  });
});
