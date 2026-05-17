import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "./config";
import {
  BUILT_IN_BATCH_SPLIT_TEMPLATES,
  buildBatchSplitUserPrompt,
  parseBatchSplitResponse,
  splitPromptWithTextModel,
} from "./batchPromptSplitter";

describe("batchPromptSplitter", () => {
  it("exposes three generic built-in templates", () => {
    expect(BUILT_IN_BATCH_SPLIT_TEMPLATES.map((template) => template.id)).toEqual([
      "basic",
      "style-consistent",
      "series",
    ]);
  });

  it("builds a user prompt with count and JSON requirements", () => {
    const prompt = buildBatchSplitUserPrompt("Create 10 World Cup posters", 10);
    expect(prompt).toContain("10");
    expect(prompt).toContain('"title"');
    expect(prompt).toContain('"prompt"');
  });

  it("parses a JSON array response", () => {
    expect(parseBatchSplitResponse('[{"title":"Argentina","prompt":"Poster for Argentina"}]')).toEqual([
      { title: "Argentina", prompt: "Poster for Argentina" },
    ]);
  });

  it("extracts a JSON array from surrounding text", () => {
    const raw = 'Here is the result:\n[{"title":"Portugal","prompt":"Poster for Portugal"}]\nDone.';
    expect(parseBatchSplitResponse(raw)).toEqual([{ title: "Portugal", prompt: "Poster for Portugal" }]);
  });

  it("rejects non-array or empty split responses", () => {
    expect(() => parseBatchSplitResponse("{}")).toThrow("AI split response must be a JSON array.");
    expect(() => parseBatchSplitResponse("[]")).toThrow("AI split response must contain at least one item.");
  });

  it("calls the configured text model with a selected system prompt", async () => {
    const sendText = vi.fn().mockResolvedValue('[{"title":"Japan","prompt":"Poster for Japan"}]');
    const result = await splitPromptWithTextModel({
      config: DEFAULT_CONFIG,
      masterPrompt: "Create a series of posters.",
      count: 1,
      templateId: "basic",
      customSystemPrompt: "",
      sendText,
    });

    expect(result).toEqual([{ title: "Japan", prompt: "Poster for Japan" }]);
    expect(sendText).toHaveBeenCalledWith(
      DEFAULT_CONFIG,
      BUILT_IN_BATCH_SPLIT_TEMPLATES[0].systemPrompt,
      expect.stringContaining("Create a series of posters."),
    );
  });
});
