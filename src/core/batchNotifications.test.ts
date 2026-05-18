import { afterEach, describe, expect, it, vi } from "vitest";
import { notifyBatchComplete, restoreDocumentTitle, updateBatchDocumentTitle } from "./batchNotifications";

describe("batchNotifications", () => {
  const originalTitle = document.title;

  afterEach(() => {
    document.title = originalTitle;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("updates and restores the document title", () => {
    document.title = "GPT Image 2 Studio";
    updateBatchDocumentTitle(3, 10);
    expect(document.title).toBe("3/10 生成中 - GPT Image 2 Studio");
    restoreDocumentTitle("GPT Image 2 Studio");
    expect(document.title).toBe("GPT Image 2 Studio");
  });

  it("does not throw when browser notification permission is unavailable", async () => {
    vi.stubGlobal("Notification", undefined);
    await expect(notifyBatchComplete("Batch done", "3 succeeded, 1 failed")).resolves.toBe(false);
  });
});
