import { sendTextRequest } from "./apiClient";
import type { BatchSplitResultItem, BatchSplitTemplate, BatchSplitTemplateId } from "./batchTypes";
import type { AppConfig } from "./config";

export const BUILT_IN_BATCH_SPLIT_TEMPLATES: BatchSplitTemplate[] = [
  {
    id: "basic",
    labelKey: "basicSplit",
    descriptionKey: "basicSplitDescription",
    systemPrompt:
      "你是批量生图提示词拆分助手。把用户的主任务拆成指定数量的独立图片提示词。每条提示词必须风格一致、主体不同、可独立发送给图片模型。只返回 JSON 数组。",
  },
  {
    id: "style-consistent",
    labelKey: "styleConsistentSplit",
    descriptionKey: "styleConsistentSplitDescription",
    systemPrompt:
      "你是视觉系列提示词拆分助手。拆分任务时必须保持统一的视觉风格、构图语言、光影、材质、色彩和镜头表达。每条结果必须独立完整。只返回 JSON 数组。",
  },
  {
    id: "series",
    labelKey: "seriesSplit",
    descriptionKey: "seriesSplitDescription",
    systemPrompt:
      "你是系列作品提示词拆分助手。适合海报组图、头像组图、产品组图等系列化输出。请把主任务拆成主题不同但整体一致的子任务。只返回 JSON 数组。",
  },
];

export type SplitPromptWithTextModelInput = {
  config: AppConfig;
  masterPrompt: string;
  count: number;
  templateId: BatchSplitTemplateId;
  customSystemPrompt: string;
  sendText?: typeof sendTextRequest;
};

export function buildBatchSplitUserPrompt(masterPrompt: string, count: number): string {
  return [
    `主任务：${masterPrompt.trim()}`,
    `目标数量：${Math.max(1, Math.round(count))}`,
    '输出要求：只返回 JSON 数组。每一项必须包含 "title" 和 "prompt" 两个字符串字段。',
    "每条 prompt 都必须是可独立发送给图片模型的完整提示词，不要依赖其他子任务上下文。",
  ].join("\n");
}

export function resolveBatchSplitSystemPrompt(templateId: BatchSplitTemplateId, customSystemPrompt: string): string {
  if (templateId === "custom" && customSystemPrompt.trim()) {
    return customSystemPrompt.trim();
  }

  return (
    BUILT_IN_BATCH_SPLIT_TEMPLATES.find((template) => template.id === templateId)?.systemPrompt
    ?? BUILT_IN_BATCH_SPLIT_TEMPLATES[0].systemPrompt
  );
}

export async function splitPromptWithTextModel(input: SplitPromptWithTextModelInput): Promise<BatchSplitResultItem[]> {
  const sendText = input.sendText ?? sendTextRequest;
  const systemPrompt = resolveBatchSplitSystemPrompt(input.templateId, input.customSystemPrompt);
  const userPrompt = buildBatchSplitUserPrompt(input.masterPrompt, input.count);
  const raw = await sendText(input.config, systemPrompt, userPrompt);
  return parseBatchSplitResponse(raw);
}

export function parseBatchSplitResponse(raw: string): BatchSplitResultItem[] {
  const jsonText = extractJsonArray(raw.trim());
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`AI split response was not valid JSON. ${error instanceof Error ? error.message : ""}`.trim());
  }

  if (!Array.isArray(parsed)) {
    throw new Error("AI split response must be a JSON array.");
  }

  const items = parsed
    .map((item) => {
      const record = item !== null && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return {
        title: typeof record.title === "string" ? record.title.trim() : "",
        prompt: typeof record.prompt === "string" ? record.prompt.trim() : "",
      };
    })
    .filter((item) => item.prompt);

  if (items.length === 0) {
    throw new Error("AI split response must contain at least one item.");
  }

  return items;
}

function extractJsonArray(value: string): string {
  if (value.startsWith("[") && value.endsWith("]")) {
    return value;
  }

  const start = value.indexOf("[");
  const end = value.lastIndexOf("]");
  if (start >= 0 && end > start) {
    return value.slice(start, end + 1);
  }

  return value;
}
