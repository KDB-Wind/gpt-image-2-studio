import { describe, expect, it } from "vitest";

import {
  BUILT_IN_PROMPT_TEMPLATES,
  createCustomPromptTemplate,
  filterPromptTemplates,
  getPromptTemplateCategories,
  mergePromptTemplates,
  removeCustomPromptTemplate,
} from "./promptTemplates";

describe("built-in prompt templates", () => {
  it("ships a small categorized template set with clear titles and complete prompts", () => {
    expect(BUILT_IN_PROMPT_TEMPLATES.length).toBeGreaterThanOrEqual(6);
    expect(BUILT_IN_PROMPT_TEMPLATES.every((template) => template.source === "built-in")).toBe(true);
    expect(BUILT_IN_PROMPT_TEMPLATES.every((template) => template.title.trim().length > 0)).toBe(true);
    expect(BUILT_IN_PROMPT_TEMPLATES.every((template) => template.prompt.trim().length > 40)).toBe(true);
  });

  it("exposes stable categories for UI filters", () => {
    expect(getPromptTemplateCategories(BUILT_IN_PROMPT_TEMPLATES)).toEqual([
      "portrait",
      "product",
      "social",
      "style",
    ]);
  });
});

describe("filterPromptTemplates", () => {
  it("filters by category and free-text query", () => {
    const result = filterPromptTemplates(BUILT_IN_PROMPT_TEMPLATES, {
      category: "product",
      query: "poster",
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result.every((template) => template.category === "product")).toBe(true);
    expect(result.some((template) => `${template.title} ${template.prompt}`.toLowerCase().includes("poster"))).toBe(
      true,
    );
  });

  it("returns every template when no filter is set", () => {
    expect(filterPromptTemplates(BUILT_IN_PROMPT_TEMPLATES, { category: "all", query: "" })).toEqual(
      BUILT_IN_PROMPT_TEMPLATES,
    );
  });
});

describe("custom prompt templates", () => {
  it("creates a local custom template from the current prompt", () => {
    const template = createCustomPromptTemplate({
      title: "My poster",
      prompt: "A clean product poster with warm daylight and readable empty copy space.",
      category: "product",
    });

    expect(template.id).toMatch(/^custom-/);
    expect(template.source).toBe("custom");
    expect(template.title).toBe("My poster");
    expect(template.category).toBe("product");
  });

  it("uses the caller-provided fallback title for untitled local templates", () => {
    const template = createCustomPromptTemplate({
      title: "",
      fallbackTitle: "未命名模板",
      prompt: "A refined portrait prompt with enough detail for the image model.",
      category: "portrait",
    });

    expect(template.title).toBe("未命名模板");
  });

  it("merges custom templates before built-ins and removes only custom templates", () => {
    const custom = createCustomPromptTemplate({
      title: "Custom portrait",
      prompt: "A refined professional portrait with neutral lighting and editorial color grading.",
      category: "portrait",
    });
    const merged = mergePromptTemplates([custom], BUILT_IN_PROMPT_TEMPLATES);

    expect(merged[0]).toEqual(custom);
    expect(removeCustomPromptTemplate([custom], custom.id)).toEqual([]);
    expect(removeCustomPromptTemplate([custom], "built-in-product-poster")).toEqual([custom]);
  });
});
