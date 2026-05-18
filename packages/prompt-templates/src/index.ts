export const PROMPT_TEMPLATE_CATEGORIES = [
  "portrait",
  "graduation",
  "product",
  "poster",
  "avatar",
  "scene",
] as const;

export type PromptTemplateCategory = (typeof PROMPT_TEMPLATE_CATEGORIES)[number];

export type PromptTemplateVariable = {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
};

export type PromptTemplateDefinition = {
  id: string;
  category: PromptTemplateCategory;
  title: string;
  description: string;
  prompt: string;
  variables: PromptTemplateVariable[];
  sourceUrl: string | null;
  license: string | null;
  enabled: boolean;
};

export type PromptTemplateFilter = {
  category?: PromptTemplateCategory;
  enabledOnly?: boolean;
};

export const CURATED_PROMPT_TEMPLATES: PromptTemplateDefinition[] = [
  {
    id: "portrait-editorial-clean",
    category: "portrait",
    title: "杂志感人物肖像",
    description: "适合生成高级、干净、可商用的人物头像或半身肖像。",
    prompt:
      "Create a polished editorial portrait of {{subject}} in the style of {{style}}. Use flattering soft light, natural skin texture, clear eyes, elegant composition, premium magazine color grading, and a calm confident expression. Avoid distorted hands, text, watermark, and over-retouched plastic skin.",
    variables: [
      { key: "subject", label: "人物", placeholder: "一位年轻创业者", required: true },
      { key: "style", label: "风格", placeholder: "clean studio portrait", required: true },
    ],
    sourceUrl: null,
    license: "Original template",
    enabled: true,
  },
  {
    id: "graduation-cinematic-photo",
    category: "graduation",
    title: "电影感毕业照",
    description: "适合学生、社团或个人纪念照，突出校园氛围与仪式感。",
    prompt:
      "Generate a cinematic graduation photo for {{subject}} at {{location}}. Include warm daylight, shallow depth of field, elegant academic atmosphere, natural pose, detailed clothing, realistic facial features, and a hopeful celebratory mood. No extra fingers, no unreadable text, no watermark.",
    variables: [
      { key: "subject", label: "人物", placeholder: "一名穿学士服的毕业生", required: true },
      { key: "location", label: "场景", placeholder: "a bright university campus lawn", required: true },
    ],
    sourceUrl: null,
    license: "Original template",
    enabled: true,
  },
  {
    id: "product-premium-ad",
    category: "product",
    title: "高级产品宣传图",
    description: "适合电商主图、社媒宣传图和新品发布视觉。",
    prompt:
      "Create a premium advertising image for {{product}}. Place the product as the clear hero subject, use {{background}} as the setting, add refined lighting, clean shadows, high-end commercial styling, sharp details, and a spacious composition suitable for ecommerce and social media. No fake brand logos, no messy text, no warped product shape.",
    variables: [
      { key: "product", label: "产品", placeholder: "一瓶极简护肤精华", required: true },
      { key: "background", label: "背景", placeholder: "warm cream stone and soft botanical accents", required: true },
    ],
    sourceUrl: null,
    license: "Original template",
    enabled: true,
  },
  {
    id: "poster-event-bold",
    category: "poster",
    title: "醒目活动海报",
    description: "适合活动预热、课程宣传、社群招募等视觉方向。",
    prompt:
      "Design a bold promotional poster concept for {{topic}}. Use a strong visual hierarchy, modern graphic layout, energetic color contrast, one central image idea, generous spacing for headline text, and a polished campaign look. Keep typography areas clean and avoid rendering unreadable detailed text.",
    variables: [
      { key: "topic", label: "主题", placeholder: "AI 绘画工作坊", required: true },
    ],
    sourceUrl: null,
    license: "Original template",
    enabled: true,
  },
  {
    id: "avatar-stylized-friendly",
    category: "avatar",
    title: "社交平台风格头像",
    description: "适合生成微信、社媒、播客或个人品牌头像。",
    prompt:
      "Create a friendly stylized avatar of {{subject}} with {{visualStyle}}. Use a clear silhouette, expressive face, clean background, appealing colors, high readability at small sizes, and a polished personal-brand feeling. Avoid text, watermark, and overly complex background details.",
    variables: [
      { key: "subject", label: "主体", placeholder: "一位戴眼镜的产品经理", required: true },
      { key: "visualStyle", label: "视觉风格", placeholder: "soft 3D illustration", required: true },
    ],
    sourceUrl: null,
    license: "Original template",
    enabled: true,
  },
  {
    id: "scene-atmospheric-world",
    category: "scene",
    title: "氛围感场景图",
    description: "适合概念图、故事插画、空间灵感和背景图。",
    prompt:
      "Generate an atmospheric scene of {{place}} during {{timeAndMood}}. Build depth with foreground, midground, and background layers, use cinematic lighting, coherent architecture or landscape details, rich but controlled color, and a strong sense of place. Avoid random objects, text, and visual clutter.",
    variables: [
      { key: "place", label: "地点", placeholder: "a small bookstore beside a rainy street", required: true },
      { key: "timeAndMood", label: "时间与情绪", placeholder: "blue hour with warm window lights", required: true },
    ],
    sourceUrl: null,
    license: "Original template",
    enabled: true,
  },
];

export function validatePromptTemplate(template: PromptTemplateDefinition): string[] {
  const errors: string[] = [];

  if (!template.id.trim()) {
    errors.push("Template id is required.");
  }

  if (!PROMPT_TEMPLATE_CATEGORIES.includes(template.category)) {
    errors.push("Template category is invalid.");
  }

  if (!template.title.trim()) {
    errors.push("Template title is required.");
  }

  if (!template.prompt.trim()) {
    errors.push("Template prompt is required.");
  }

  const keys = new Set<string>();
  for (const variable of template.variables) {
    if (!variable.key.trim()) {
      errors.push("Variable key is required.");
    }
    if (keys.has(variable.key)) {
      errors.push("Variable keys must be unique.");
    }
    keys.add(variable.key);

    if (variable.required && !template.prompt.includes(`{{${variable.key}}}`)) {
      errors.push(`Required variable ${variable.key} is not used in prompt.`);
    }
  }

  return errors;
}

export function renderPromptTemplate(
  template: PromptTemplateDefinition,
  values: Record<string, string | undefined>,
): string {
  let prompt = template.prompt;

  for (const variable of template.variables) {
    const rawValue = values[variable.key]?.trim();
    if (variable.required && !rawValue) {
      throw new Error(`Missing required variable: ${variable.key}`);
    }

    prompt = prompt.split(`{{${variable.key}}}`).join(rawValue || variable.placeholder);
  }

  return prompt;
}

export function filterPromptTemplates(
  templates: readonly PromptTemplateDefinition[],
  filter: PromptTemplateFilter = {},
): PromptTemplateDefinition[] {
  return templates.filter((template) => {
    if (filter.enabledOnly && !template.enabled) {
      return false;
    }

    if (filter.category && template.category !== filter.category) {
      return false;
    }

    return true;
  });
}
