export type PromptTemplateCategory = "portrait" | "product" | "social" | "style" | "custom";
export type PromptTemplateSource = "built-in" | "custom";

export type PromptTemplate = {
  id: string;
  title: string;
  category: PromptTemplateCategory;
  prompt: string;
  source: PromptTemplateSource;
  createdAt?: string;
};

export type PromptTemplateFilter = {
  category: PromptTemplateCategory | "all";
  query: string;
};

export type CreateCustomPromptTemplateInput = {
  title: string;
  prompt: string;
  category: PromptTemplateCategory;
  fallbackTitle?: string;
};

const CATEGORY_ORDER: PromptTemplateCategory[] = ["portrait", "product", "social", "style", "custom"];

export const BUILT_IN_PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: "built-in-portrait-graduation",
    title: "Graduation portrait",
    category: "portrait",
    source: "built-in",
    prompt:
      "Create a refined graduation portrait with natural daylight, confident posture, clean campus-inspired background, realistic fabric texture, polished skin detail, and an editorial photography look.",
  },
  {
    id: "built-in-portrait-profile",
    title: "Professional profile photo",
    category: "portrait",
    source: "built-in",
    prompt:
      "Create a professional profile portrait with soft studio lighting, approachable expression, neutral background, crisp facial detail, subtle depth of field, and a clean modern business style.",
  },
  {
    id: "built-in-product-poster",
    title: "Product poster",
    category: "product",
    source: "built-in",
    prompt:
      "Create a premium product poster with the product centered, warm directional lighting, elegant shadows, clear empty copy space, high-end commercial photography, and a clean advertising layout.",
  },
  {
    id: "built-in-product-lifestyle",
    title: "Lifestyle product scene",
    category: "product",
    source: "built-in",
    prompt:
      "Place the product in a believable lifestyle scene with tasteful props, natural reflections, realistic scale, warm ambience, and a composition suitable for an ecommerce hero image.",
  },
  {
    id: "built-in-social-cover",
    title: "Social media cover",
    category: "social",
    source: "built-in",
    prompt:
      "Create a bright social media cover image with a strong focal subject, bold negative space for text, clean shapes, energetic color accents, and a polished creator-brand visual style.",
  },
  {
    id: "built-in-style-clay",
    title: "Soft clay illustration",
    category: "style",
    source: "built-in",
    prompt:
      "Transform the idea into a soft clay-style 3D illustration with rounded forms, tactile material, gentle shadows, warm pastel lighting, and a friendly handcrafted visual tone.",
  },
  {
    id: "built-in-style-film",
    title: "Cinematic film still",
    category: "style",
    source: "built-in",
    prompt:
      "Render the scene as a cinematic film still with expressive lighting, thoughtful composition, subtle film grain, rich but controlled color grading, and a strong sense of atmosphere.",
  },
];

export function getPromptTemplateCategories(templates: PromptTemplate[]): PromptTemplateCategory[] {
  const present = new Set(templates.map((template) => template.category));
  return CATEGORY_ORDER.filter((category) => present.has(category));
}

export function filterPromptTemplates(
  templates: PromptTemplate[],
  filter: PromptTemplateFilter,
): PromptTemplate[] {
  const query = filter.query.trim().toLowerCase();

  return templates.filter((template) => {
    if (filter.category !== "all" && template.category !== filter.category) {
      return false;
    }

    if (!query) {
      return true;
    }

    return `${template.title} ${template.prompt}`.toLowerCase().includes(query);
  });
}

export function mergePromptTemplates(
  customTemplates: PromptTemplate[],
  builtInTemplates = BUILT_IN_PROMPT_TEMPLATES,
): PromptTemplate[] {
  return [
    ...customTemplates.filter((template) => template.source === "custom"),
    ...builtInTemplates,
  ];
}

export function createCustomPromptTemplate(input: CreateCustomPromptTemplateInput): PromptTemplate {
  const title = input.title.trim() || input.fallbackTitle?.trim() || "Untitled template";
  const prompt = input.prompt.trim();

  if (!prompt) {
    throw new Error("Prompt template content is required.");
  }

  return {
    id: `custom-${createId()}`,
    title,
    prompt,
    category: input.category,
    source: "custom",
    createdAt: new Date().toISOString(),
  };
}

export function removeCustomPromptTemplate(customTemplates: PromptTemplate[], id: string): PromptTemplate[] {
  return customTemplates.filter((template) => template.id !== id || template.source !== "custom");
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
