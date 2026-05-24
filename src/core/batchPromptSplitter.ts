import { sendTextRequest } from "./apiClient";
import {
  MAX_BATCH_TASK_COUNT,
  type BatchSplitPlanningResult,
  type BatchSplitResultItem,
  type BatchSplitTemplate,
  type BatchSplitTemplateId,
} from "./batchTypes";
import type { AppConfig } from "./config";

export const BUILT_IN_BATCH_SPLIT_TEMPLATES: BatchSplitTemplate[] = [
  {
    id: "basic",
    labelKey: "basicSplit",
    descriptionKey: "basicSplitDescription",
    systemPrompt:
      "你是批量生图任务规划助手。把用户的主任务拆成可独立执行的图片提示词，并判断最适合的任务数量。每条提示词必须风格一致、主体不同、可独立发送给图片模型。只返回 JSON 对象。",
  },
  {
    id: "style-consistent",
    labelKey: "styleConsistentSplit",
    descriptionKey: "styleConsistentSplitDescription",
    systemPrompt:
      "你是视觉系列提示词拆分助手。拆分任务时必须保持统一的视觉风格、构图语言、光影、材质、色彩和镜头表达，并判断最适合的任务数量。每条结果必须独立完整。只返回 JSON 对象。",
  },
  {
    id: "series",
    labelKey: "seriesSplit",
    descriptionKey: "seriesSplitDescription",
    systemPrompt:
      "你是系列作品提示词拆分助手。适合海报组图、头像组图、产品组图等系列化输出。请把主任务拆成主题不同但整体一致的子任务，并判断最适合的任务数量。只返回 JSON 对象。",
  },
];

export type SplitPromptWithTextModelInput = {
  config: AppConfig;
  masterPrompt: string;
  count: number;
  templateId: BatchSplitTemplateId;
  customSystemPrompt: string;
  styleLock?: string;
  allowAiTaskCountPlanning?: boolean;
  sendText?: typeof sendTextRequest;
};

export function buildBatchSplitUserPrompt(
  masterPrompt: string,
  count: number,
  styleLock = "",
  allowAiTaskCountPlanning = true,
): string {
  const targetCount = Math.max(1, Math.round(count));
  const lines = [
    `主任务：${masterPrompt.trim()}`,
    `用户初始填写的任务数量：${targetCount}`,
    `最多允许任务数量：${MAX_BATCH_TASK_COUNT}`,
    allowAiTaskCountPlanning
      ? '请先判断主任务最适合拆分成几个独立任务，并把数量写入 "recommendedCount"。如果主任务明确或隐含了数量、主体列表、风格数量、商品数量等，请以主任务意图为准；如果无法判断，就使用用户初始填写的任务数量。'
      : `不要自动调整任务数量。"recommendedCount" 必须等于 ${targetCount}，并按这个数量拆分。`,
    '输出要求：只返回 JSON 对象，结构为 {"recommendedCount": number, "countReason": string, "items": [...]}。',
    '"countReason" 用一句话说明为什么推荐这个数量。',
    'items 中每一项必须包含 "title"、"prompt"、"suggestedName" 和 "notes" 四个字符串字段。',
    '"title" 写给用户看的任务标题，"suggestedName" 写成适合作为图片文件名的简短名称，"notes" 写一句拆分理由或注意事项。',
    "每条 prompt 都必须是可独立发送给图片模型的完整提示词，不要依赖其他子任务上下文。",
  ];

  if (styleLock.trim()) {
    lines.push(`批次统一风格要求：${styleLock.trim()}`);
    lines.push("拆分后的每条 prompt 都必须保留这条统一风格要求。");
  }

  return lines.join("\n");
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

export async function splitPromptWithTextModel(input: SplitPromptWithTextModelInput): Promise<BatchSplitPlanningResult> {
  const sendText = input.sendText ?? sendTextRequest;
  const systemPrompt = resolveBatchSplitSystemPrompt(input.templateId, input.customSystemPrompt);
  const userPrompt = buildBatchSplitUserPrompt(
    input.masterPrompt,
    input.count,
    input.styleLock,
    input.allowAiTaskCountPlanning ?? true,
  );
  const raw = await sendText(input.config, systemPrompt, userPrompt);
  return parseBatchSplitResponse(raw);
}

export function parseBatchSplitResponse(raw: string): BatchSplitPlanningResult {
  const jsonText = extractJsonValue(raw.trim());
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`AI split response was not valid JSON. ${error instanceof Error ? error.message : ""}`.trim());
  }

  const record = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
  const rawItems = Array.isArray(parsed) ? parsed : Array.isArray(record?.items) ? record.items : null;

  if (!rawItems) {
    throw new Error("AI split response must contain an items array.");
  }

  const items = rawItems
    .map((item): BatchSplitResultItem => {
      const record = item !== null && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const suggestedName = typeof record.suggestedName === "string" ? record.suggestedName.trim() : "";
      const notes = typeof record.notes === "string" ? record.notes.trim() : "";

      return {
        title: typeof record.title === "string" ? record.title.trim() : "",
        prompt: typeof record.prompt === "string" ? record.prompt.trim() : "",
        ...(suggestedName ? { suggestedName } : null),
        ...(notes ? { notes } : null),
      };
    })
    .filter((item) => item.prompt);

  if (items.length === 0) {
    throw new Error("AI split response must contain at least one item.");
  }

  const recommendedCount = typeof record?.recommendedCount === "number" && Number.isFinite(record.recommendedCount)
    ? Math.round(record.recommendedCount)
    : undefined;
  const countReason = typeof record?.countReason === "string" ? record.countReason.trim() : undefined;

  return {
    ...(recommendedCount !== undefined ? { recommendedCount } : null),
    ...(countReason ? { countReason } : null),
    items,
  };
}

function extractJsonValue(value: string): string {
  if ((value.startsWith("[") && value.endsWith("]")) || (value.startsWith("{") && value.endsWith("}"))) {
    return value;
  }

  const arrayStart = value.indexOf("[");
  const objectStart = value.indexOf("{");
  const starts = [arrayStart, objectStart].filter((index) => index >= 0);
  const start = starts.length > 0 ? Math.min(...starts) : -1;

  if (start >= 0) {
    const endMarker = value[start] === "[" ? "]" : "}";
    const end = value.lastIndexOf(endMarker);
    if (end > start) {
      return value.slice(start, end + 1);
    }
  }

  return value;
}
