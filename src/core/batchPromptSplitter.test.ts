import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "./config";
import {
  BUILT_IN_BATCH_SPLIT_TEMPLATES,
  buildBatchSplitUserPrompt,
  normalizeBatchSplitPlan,
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

  it("builds a user prompt with count planning and JSON object requirements", () => {
    const prompt = buildBatchSplitUserPrompt("Create 10 World Cup posters", 10);
    expect(prompt).toContain("10");
    expect(prompt).toContain("recommendedCount");
    expect(prompt).toContain("countReason");
    expect(prompt).toContain("items");
    expect(prompt).toContain('"title"');
    expect(prompt).toContain('"prompt"');
    expect(prompt).toContain('"suggestedName"');
    expect(prompt).toContain('"notes"');
  });

  it("instructs the text model not to truncate explicit target lists to the initial count", () => {
    const prompt = buildBatchSplitUserPrompt(
      "为我生成法国 / 日本 / 比利时 / 韩国 2026 世界杯宣传海报",
      3,
      "",
      true,
    );

    expect(prompt).toContain("用户初始填写的任务数量不是上限");
    expect(prompt).toContain("不要因为用户初始填写的任务数量较小而丢弃主任务中的明确主体");
    expect(prompt).toContain("recommendedCount 必须等于 items.length");
    expect(prompt).toContain("保留主任务中的主体名称");
  });

  it("includes the batch style lock in the text-model split prompt", async () => {
    const sendText = vi.fn().mockResolvedValue('[{"title":"Japan","prompt":"Poster for Japan"}]');
    await splitPromptWithTextModel({
      config: DEFAULT_CONFIG,
      masterPrompt: "Create a series of posters.",
      count: 1,
      templateId: "basic",
      customSystemPrompt: "",
      styleLock: "same camera angle, cream background, warm daylight",
      sendText,
    });

    expect(sendText).toHaveBeenCalledWith(
      DEFAULT_CONFIG,
      BUILT_IN_BATCH_SPLIT_TEMPLATES[0].systemPrompt,
      expect.stringContaining("same camera angle, cream background, warm daylight"),
    );
  });

  it("parses a JSON array response", () => {
    expect(parseBatchSplitResponse('[{"title":"Argentina","prompt":"Poster for Argentina"}]')).toEqual({
      items: [{ title: "Argentina", prompt: "Poster for Argentina" }],
    });
  });

  it("parses a JSON object response with AI recommended task count", () => {
    expect(
      parseBatchSplitResponse(
        JSON.stringify({
          recommendedCount: 4,
          countReason: "The master task asks for four countries.",
          items: [
            { title: "France", prompt: "Create a France poster." },
            { title: "Japan", prompt: "Create a Japan poster." },
          ],
        }),
      ),
    ).toEqual({
      recommendedCount: 4,
      countReason: "The master task asks for four countries.",
      items: [
        { title: "France", prompt: "Create a France poster." },
        { title: "Japan", prompt: "Create a Japan poster." },
      ],
    });
  });

  it("parses planner metadata when the text model returns it", () => {
    expect(
      parseBatchSplitResponse(
        '[{"title":"France poster","prompt":"Create a France poster.","suggestedName":"france-world-cup-poster","notes":"Use French headline text."}]',
      ),
    ).toEqual({
      items: [
        {
          title: "France poster",
          prompt: "Create a France poster.",
          suggestedName: "france-world-cup-poster",
          notes: "Use French headline text.",
        },
      ],
    });
  });

  it("rejects a recommended count that does not match the returned item count", () => {
    const items = [
      { title: "France", prompt: "Create a France poster." },
      { title: "Japan", prompt: "Create a Japan poster." },
      { title: "Belgium", prompt: "Create a Belgium poster." },
    ];

    expect(
      normalizeBatchSplitPlan({
        planning: { recommendedCount: 4, items },
        initialCount: 3,
        allowAiTaskCountPlanning: true,
      }),
    ).toEqual({
      status: "invalid",
      reason: "recommended-count-mismatch",
      expectedCount: 4,
      actualCount: 3,
    });
    expect(items).toHaveLength(3);
  });

  it("uses all returned items when auto planning is enabled and no count is recommended", () => {
    const items = Array.from({ length: 4 }, (_, index) => ({
      title: `Task ${index + 1}`,
      prompt: `Create image ${index + 1}.`,
    }));

    const result = normalizeBatchSplitPlan({
      planning: { items },
      initialCount: 3,
      allowAiTaskCountPlanning: true,
    });

    expect(result).toMatchObject({
      status: "ready",
      taskCount: 4,
      didAdjustTaskCount: true,
    });
    if (result.status === "ready") {
      expect(result.items).toBe(items);
    }
  });

  it("requires exactly the user count when auto planning is disabled", () => {
    const items = Array.from({ length: 8 }, (_, index) => ({
      title: `Task ${index + 1}`,
      prompt: `Create image ${index + 1}.`,
    }));

    expect(
      normalizeBatchSplitPlan({
        planning: { recommendedCount: 8, items },
        initialCount: 5,
        allowAiTaskCountPlanning: false,
      }),
    ).toEqual({
      status: "invalid",
      reason: "fixed-count-mismatch",
      expectedCount: 5,
      actualCount: 8,
    });
  });

  it("retains an over-limit AI plan intact until explicit confirmation", () => {
    const items = Array.from({ length: 25 }, (_, index) => ({
      title: `Task ${index + 1}`,
      prompt: `Create image ${index + 1}.`,
    }));

    const result = normalizeBatchSplitPlan({
      planning: { recommendedCount: 25, countReason: "Twenty-five named subjects.", items },
      initialCount: 5,
      allowAiTaskCountPlanning: true,
    });

    expect(result).toMatchObject({
      status: "requires-confirmation",
      requestedCount: 25,
      maxTaskCount: 20,
      countReason: "Twenty-five named subjects.",
    });
    if (result.status === "requires-confirmation") {
      expect(result.items).toBe(items);
      expect(result.items).toHaveLength(25);
    }
  });

  it("extracts a JSON array from surrounding text", () => {
    const raw = 'Here is the result:\n[{"title":"Portugal","prompt":"Poster for Portugal"}]\nDone.';
    expect(parseBatchSplitResponse(raw)).toEqual({ items: [{ title: "Portugal", prompt: "Poster for Portugal" }] });
  });

  it("rejects non-array or empty split responses", () => {
    expect(() => parseBatchSplitResponse("{}")).toThrow("AI split response must contain an items array.");
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

    expect(result).toEqual({ items: [{ title: "Japan", prompt: "Poster for Japan" }] });
    expect(sendText).toHaveBeenCalledWith(
      DEFAULT_CONFIG,
      BUILT_IN_BATCH_SPLIT_TEMPLATES[0].systemPrompt,
      expect.stringContaining("Create a series of posters."),
    );
  });
});
