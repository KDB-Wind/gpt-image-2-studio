import type { PlatformPromptTemplate } from "./platformClient";

export function renderTemplatePrompt(
  template: PlatformPromptTemplate,
  values: Record<string, string | undefined>,
): string {
  let prompt = template.prompt;

  for (const variable of template.variables) {
    const value = values[variable.key]?.trim();
    if (variable.required && !value) {
      throw new Error(`${variable.label || variable.key} is required.`);
    }

    prompt = prompt.split(`{{${variable.key}}}`).join(value || variable.placeholder);
  }

  return prompt;
}

export function getTemplateCategories(templates: PlatformPromptTemplate[]): string[] {
  return [...new Set(templates.map((template) => template.category))].sort((left, right) =>
    left.localeCompare(right),
  );
}

export function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    portrait: "人物肖像",
    graduation: "毕业照",
    product: "商品宣传",
    poster: "海报设计",
    avatar: "头像",
    scene: "场景概念",
  };

  return labels[category] ?? category;
}
