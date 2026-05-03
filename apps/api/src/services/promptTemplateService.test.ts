import { describe, expect, it } from "vitest";

import { createInMemoryPlatformRepository } from "@chat-to-image/platform-db/in-memory";
import { CURATED_PROMPT_TEMPLATES } from "@chat-to-image/prompt-templates";
import {
  listEnabledPromptTemplates,
  syncCuratedPromptTemplates,
} from "./promptTemplateService";

describe("promptTemplateService", () => {
  it("syncs curated templates into the platform repository", async () => {
    const repo = createInMemoryPlatformRepository();

    const result = await syncCuratedPromptTemplates({ repo });

    expect(result.synced).toBe(CURATED_PROMPT_TEMPLATES.length);
    await expect(repo.listPromptTemplates()).resolves.toHaveLength(CURATED_PROMPT_TEMPLATES.length);
  });

  it("lists enabled templates by category", async () => {
    const repo = createInMemoryPlatformRepository();
    await syncCuratedPromptTemplates({ repo });

    const templates = await listEnabledPromptTemplates({ repo, category: "product" });

    expect(templates.length).toBeGreaterThan(0);
    expect(templates.every((template) => template.enabled)).toBe(true);
    expect(templates.every((template) => template.category === "product")).toBe(true);
  });
});
