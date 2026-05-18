import type { PlatformRepository, PromptTemplate, PromptTemplateCategory } from "@chat-to-image/platform-db";
import {
  CURATED_PROMPT_TEMPLATES,
  filterPromptTemplates,
  validatePromptTemplate,
  type PromptTemplateDefinition,
} from "@chat-to-image/prompt-templates";

export async function syncCuratedPromptTemplates(input: { repo: PlatformRepository }) {
  let synced = 0;

  for (const template of CURATED_PROMPT_TEMPLATES) {
    const errors = validatePromptTemplate(template);
    if (errors.length > 0) {
      throw new Error(`Invalid curated prompt template ${template.id}: ${errors.join("; ")}`);
    }

    await input.repo.upsertPromptTemplate(toRepositoryTemplate(template));
    synced += 1;
  }

  return { synced };
}

export async function listEnabledPromptTemplates(input: {
  repo: PlatformRepository;
  category?: PromptTemplateCategory;
}) {
  const templates = await input.repo.listPromptTemplates();
  const source = templates.length > 0 ? templates : getCuratedRepositoryTemplates();
  return filterPromptTemplates(source, {
    category: input.category,
    enabledOnly: true,
  });
}

function toRepositoryTemplate(template: PromptTemplateDefinition) {
  return {
    id: template.id,
    category: template.category,
    title: template.title,
    description: template.description,
    prompt: template.prompt,
    variables: template.variables,
    sourceUrl: template.sourceUrl,
    license: template.license,
    enabled: template.enabled,
  };
}

function getCuratedRepositoryTemplates(): PromptTemplate[] {
  const now = new Date(0);
  return CURATED_PROMPT_TEMPLATES.map((template) => ({
    ...toRepositoryTemplate(template),
    createdAt: now,
    updatedAt: now,
  }));
}
