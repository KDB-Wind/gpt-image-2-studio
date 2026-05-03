import { describe, expect, it } from "vitest";

import {
  CURATED_PROMPT_TEMPLATES,
  filterPromptTemplates,
  renderPromptTemplate,
  validatePromptTemplate,
} from "./index";

describe("prompt templates", () => {
  it("ships curated templates with valid metadata", () => {
    expect(CURATED_PROMPT_TEMPLATES.length).toBeGreaterThanOrEqual(6);

    for (const template of CURATED_PROMPT_TEMPLATES) {
      expect(validatePromptTemplate(template)).toEqual([]);
      expect(template.title).not.toContain("{{");
      expect(template.prompt.length).toBeGreaterThan(30);
    }
  });

  it("renders required variables into the full prompt", () => {
    const prompt = renderPromptTemplate(CURATED_PROMPT_TEMPLATES[0], {
      subject: "a college graduate",
      style: "clean studio portrait",
    });

    expect(prompt).toContain("a college graduate");
    expect(prompt).toContain("clean studio portrait");
    expect(prompt).not.toContain("{{subject}}");
  });

  it("rejects missing required variables and duplicate variable keys", () => {
    expect(() => renderPromptTemplate(CURATED_PROMPT_TEMPLATES[0], {})).toThrow("Missing required variable");

    expect(
      validatePromptTemplate({
        ...CURATED_PROMPT_TEMPLATES[0],
        variables: [
          { key: "subject", label: "Subject", placeholder: "person", required: true },
          { key: "subject", label: "Subject copy", placeholder: "person", required: false },
        ],
      }),
    ).toContain("Variable keys must be unique.");
  });

  it("filters enabled templates by category", () => {
    const portraitTemplates = filterPromptTemplates(CURATED_PROMPT_TEMPLATES, {
      category: "portrait",
      enabledOnly: true,
    });

    expect(portraitTemplates.length).toBeGreaterThan(0);
    expect(portraitTemplates.every((template) => template.category === "portrait")).toBe(true);
    expect(portraitTemplates.every((template) => template.enabled)).toBe(true);
  });
});
