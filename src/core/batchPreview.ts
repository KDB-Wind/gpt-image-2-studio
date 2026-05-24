import { summarizeBatchTasks } from "./batchManifest";
import type { BatchStatus, BatchSummary, BatchTask } from "./batchTypes";

export type BatchPreviewImage = {
  id: string;
  index: number;
  title: string;
  prompt: string;
  previewUrl: string;
  outputPath: string;
  durationMs: number;
  completedAt: string;
};

export type BatchPreviewState = {
  status: BatchStatus;
  summary: BatchSummary;
  latestImage: BatchPreviewImage | null;
  images: BatchPreviewImage[];
  runningTask: Pick<BatchTask, "id" | "index" | "title" | "prompt" | "startedAt"> | null;
};

export function buildBatchPreview({
  status,
  tasks,
  maxImages = 8,
}: {
  status: BatchStatus;
  tasks: BatchTask[];
  maxImages?: number;
}): BatchPreviewState | null {
  if (tasks.length === 0) {
    return null;
  }

  const images = tasks
    .filter((task) => task.status === "succeeded" && task.previewUrl)
    .map(toPreviewImage)
    .slice(-maxImages);
  const latestImage = images.reduce<BatchPreviewImage | null>((latest, image) => {
    if (!latest) {
      return image;
    }

    return getSortTime(image) >= getSortTime(latest) ? image : latest;
  }, null);
  const runningTask =
    tasks.find((task) => task.status === "running")
    ?? null;

  return {
    status,
    summary: summarizeBatchTasks(tasks),
    latestImage,
    images,
    runningTask: runningTask
      ? {
          id: runningTask.id,
          index: runningTask.index,
          title: runningTask.title,
          prompt: runningTask.prompt,
          startedAt: runningTask.startedAt,
        }
      : null,
  };
}

function toPreviewImage(task: BatchTask): BatchPreviewImage {
  return {
    id: task.id,
    index: task.index,
    title: task.title,
    prompt: task.prompt,
    previewUrl: task.previewUrl,
    outputPath: task.outputPath,
    durationMs: task.durationMs,
    completedAt: task.completedAt,
  };
}

function getSortTime(image: BatchPreviewImage): number {
  const time = Date.parse(image.completedAt);
  return Number.isNaN(time) ? image.index : time;
}
