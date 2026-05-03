import { describe, expect, it } from "vitest";

import { getTemplateCategories, renderTemplatePrompt } from "./promptTools";
import type { PlatformPromptTemplate } from "./platformClient";

const template: PlatformPromptTemplate = {
  id: "product",
  category: "product",
  title: "Product poster",
  description: "Demo",
  prompt: "Create a poster for {{product}} with {{background}}.",
  variables: [
    { key: "product", label: "Product", placeholder: "a ceramic cup", required: true },
    { key: "background", label: "Background", placeholder: "morning light", required: false },
  ],
  enabled: true,
};

describe("platform prompt tools", () => {
  it("renders template variables with user values and placeholders", () => {
    expect(renderTemplatePrompt(template, { product: "a glass bottle" })).toBe(
      "Create a poster for a glass bottle with morning light.",
    );
  });

  it("throws when a required variable is missing", () => {
    expect(() => renderTemplatePrompt(template, { product: "" })).toThrow("Product");
  });

  it("lists stable categories from templates", () => {
    expect(getTemplateCategories([
      { ...template, category: "product" },
      { ...template, id: "portrait", category: "portrait" },
      { ...template, id: "product-2", category: "product" },
    ])).toEqual(["portrait", "product"]);
  });
});
