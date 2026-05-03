import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { PlatformRepository, PromptTemplateCategory } from "@chat-to-image/platform-db";
import { PROMPT_TEMPLATE_CATEGORIES } from "@chat-to-image/prompt-templates";
import {
  listEnabledPromptTemplates,
  syncCuratedPromptTemplates,
} from "../services/promptTemplateService";
import { requireAdminToken, type AdminRouteOptions } from "./adminAuth";

export type PromptTemplateRouteDependencies = AdminRouteOptions & {
  repo: PlatformRepository;
};

const categorySchema = z.enum(PROMPT_TEMPLATE_CATEGORIES);

export function registerPromptTemplateRoutes(app: FastifyInstance, deps: PromptTemplateRouteDependencies) {
  app.get("/api/prompt-templates", async (request, reply) => {
    const parsed = z.object({ category: categorySchema.optional() }).safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid prompt template query.",
        details: parsed.error.flatten(),
      });
    }

    const templates = await listEnabledPromptTemplates({
      repo: deps.repo,
      category: parsed.data.category as PromptTemplateCategory | undefined,
    });
    return { templates };
  });

  app.post("/api/admin/prompt-templates/sync-curated", async (request, reply) => {
    if (!requireAdminToken(request, reply, deps.admin?.token)) {
      return reply;
    }

    return syncCuratedPromptTemplates({ repo: deps.repo });
  });
}
