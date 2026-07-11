import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";

import { buildBatchManifest, summarizeBatchTasks } from "../core/batchManifest";
import { notifyBatchComplete, restoreDocumentTitle, updateBatchDocumentTitle } from "../core/batchNotifications";
import { buildBatchPreview, type BatchPreviewState } from "../core/batchPreview";
import {
  createTasksFromSplitResults,
  createTasksFromPromptList,
  createTasksFromRepeatedPrompt,
  renumberBatchTasks,
} from "../core/batchPlanner";
import {
  BUILT_IN_BATCH_SPLIT_TEMPLATES,
  normalizeBatchSplitPlan,
  splitPromptWithTextModel,
} from "../core/batchPromptSplitter";
import { retrySingleBatchTask, runBatchTasks } from "../core/batchRunner";
import {
  buildBatchPromptRecipe,
  countRecoverableBatchTasks,
  formatBatchPromptRecipe,
  hasFailedBatchTasks,
  mergeRetriedBatchTask,
  resetFailedBatchTasks,
} from "../core/batchWorkflow";
import {
  MAX_BATCH_CONCURRENCY,
  MAX_BATCH_TASK_COUNT,
  clampBatchExecutionConfig,
  clampBatchConcurrency,
  clampBatchTaskCount,
  createBatchId,
  type BatchExecutionConfig,
  type BatchSplitTemplateId,
  type BatchSource,
  type BatchStatus,
  type BatchTask,
} from "../core/batchTypes";
import type { AppConfig } from "../core/config";
import {
  MAX_REFERENCE_IMAGES,
  addReferenceImages,
  type AddReferenceImagesResult,
  type ReferenceImageItem,
} from "../core/referenceImages";
import { getTranslations, type UiLanguage } from "../i18n/translations";
import type { RuntimeAdapter } from "../runtime/types";

type BatchPanelProps = {
  config: AppConfig;
  runtime: RuntimeAdapter | null;
  language: UiLanguage;
  referenceImages?: File[];
  onConfigChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
  onHistoryChanged: () => Promise<void>;
  requireValidConfig: (actionLabel: string) => boolean;
  setAppMessage: (message: string) => void;
  onBatchPreviewChange?: (preview: BatchPreviewState | null) => void;
  renderOutputOptions?: (disabled: boolean) => ReactNode;
};

export function BatchPanel({
  config,
  runtime,
  language,
  onConfigChange,
  onHistoryChanged,
  requireValidConfig,
  setAppMessage,
  onBatchPreviewChange,
  renderOutputOptions,
}: BatchPanelProps) {
  const copy = getTranslations(language);
  const [source, setSource] = useState<BatchSource>("same-prompt");
  const [status, setStatus] = useState<BatchStatus>("draft");
  const [batchId, setBatchId] = useState(() => createBatchId());
  const [batchCreatedAt, setBatchCreatedAt] = useState(() => new Date().toISOString());
  const [startedAt, setStartedAt] = useState("");
  const [completedAt, setCompletedAt] = useState("");
  const [batchTitle, setBatchTitle] = useState("");
  const [masterPrompt, setMasterPrompt] = useState("");
  const [styleLock, setStyleLock] = useState("");
  const [customPromptDrafts, setCustomPromptDrafts] = useState<string[]>(() =>
    createEmptyPromptDrafts(config.batchDefaultTaskCount),
  );
  const [splitTemplateId, setSplitTemplateId] = useState<BatchSplitTemplateId>("basic");
  const [customSplitSystemPrompt, setCustomSplitSystemPrompt] = useState("");
  const [isSplitting, setIsSplitting] = useState(false);
  const [taskCount, setTaskCount] = useState(() => clampBatchTaskCount(config.batchDefaultTaskCount));
  const [tasks, setTasks] = useState<BatchTask[]>([]);
  const [retryingTaskIds, setRetryingTaskIds] = useState<Set<string>>(() => new Set());
  const [pauseMessage, setPauseMessage] = useState("");
  const [promptRecipeText, setPromptRecipeText] = useState("");
  const [batchReferenceImages, setBatchReferenceImages] = useState<ReferenceImageItem[]>([]);
  const [isBatchReferenceDragOver, setIsBatchReferenceDragOver] = useState(false);
  const [taskReferenceImagesById, setTaskReferenceImagesById] = useState<Record<string, ReferenceImageItem[]>>({});
  const [taskUsesGlobalReferencesById, setTaskUsesGlobalReferencesById] = useState<Record<string, boolean>>({});
  const [expandedTaskReferenceIds, setExpandedTaskReferenceIds] = useState<Set<string>>(() => new Set());
  const [taskReferenceDragOverId, setTaskReferenceDragOverId] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const pauseRef = useRef(false);
  const isSplittingRef = useRef(false);
  const retryingTaskIdsRef = useRef<Set<string>>(new Set());
  const latestTasksRef = useRef<BatchTask[]>([]);
  const batchReferenceInputRef = useRef<HTMLInputElement | null>(null);
  const batchReferenceDragDepthRef = useRef(0);
  const batchReferenceImagesRef = useRef<ReferenceImageItem[]>([]);
  const taskReferenceInputRefs = useRef(new Map<string, HTMLInputElement>());
  const taskReferenceDragDepthRef = useRef<Record<string, number>>({});
  const taskReferenceImagesByIdRef = useRef<Record<string, ReferenceImageItem[]>>({});

  const executionConfig: BatchExecutionConfig = useMemo(
    () =>
      clampBatchExecutionConfig({
        concurrency: config.batchDefaultConcurrency,
        intervalSeconds: config.batchDefaultIntervalSeconds,
        maxRetries: config.batchDefaultMaxRetries,
      }),
    [config.batchDefaultConcurrency, config.batchDefaultIntervalSeconds, config.batchDefaultMaxRetries],
  );

  const summary = useMemo(() => summarizeBatchTasks(tasks), [tasks]);
  const saveSummary = useMemo(
    () => ({
      authorized: tasks.filter((task) => task.status === "succeeded" && task.saveMode === "authorized-directory").length,
      fallback: tasks.filter((task) => task.status === "succeeded" && task.saveMode === "browser-download").length,
    }),
    [tasks],
  );
  const isRunning = status === "running";
  const hasActiveTaskRetry = retryingTaskIds.size > 0;
  const isTaskListLocked = isRunning || hasActiveTaskRetry;
  const isTaskMutationLocked = isTaskListLocked || isSplitting;
  const batchDisplayTitle = batchTitle.trim() || "batch-images";
  const recoverableTaskCount = useMemo(() => countRecoverableBatchTasks(tasks), [tasks]);
  const hasFailedTasks = useMemo(() => hasFailedBatchTasks(tasks), [tasks]);
  const hasExecutedTasks = Boolean(startedAt) || summary.succeeded > 0 || summary.failed > 0 || summary.skipped > 0;
  const primaryBatchActionLabel =
    hasExecutedTasks && recoverableTaskCount > 0
      ? copy.batch.actions.continueUnfinished
      : status === "paused"
        ? copy.batch.actions.continue
        : copy.batch.actions.start;

  useEffect(() => {
    onBatchPreviewChange?.(buildBatchPreview({ status, tasks }));
  }, [onBatchPreviewChange, status, tasks]);

  useEffect(() => {
    batchReferenceImagesRef.current = batchReferenceImages;
  }, [batchReferenceImages]);

  useEffect(() => {
    taskReferenceImagesByIdRef.current = taskReferenceImagesById;
  }, [taskReferenceImagesById]);

  useEffect(() => {
    return () => {
      revokeReferenceImages(batchReferenceImagesRef.current);
      revokeTaskReferenceImages(taskReferenceImagesByIdRef.current);
    };
  }, []);

  useEffect(() => {
    if (isRunning || isSplitting || tasks.length > 0) {
      return;
    }

    const nextCount = clampBatchTaskCount(config.batchDefaultTaskCount);
    setTaskCount(nextCount);
    setCustomPromptDrafts((current) => resizePromptDrafts(current, nextCount));
  }, [config.batchDefaultTaskCount, isRunning, isSplitting, tasks.length]);

  function commitTasks(update: BatchTask[] | ((current: BatchTask[]) => BatchTask[])): BatchTask[] {
    const nextTasks = typeof update === "function" ? update(latestTasksRef.current) : update;
    latestTasksRef.current = nextTasks;
    setTasks(nextTasks);
    return nextTasks;
  }

  function hasTaskRetryLock(): boolean {
    return retryingTaskIdsRef.current.size > 0;
  }

  function hasTaskMutationLock(): boolean {
    return isRunning || hasTaskRetryLock() || isSplittingRef.current;
  }

  function acquireTaskRetry(taskId: string): boolean {
    if (retryingTaskIdsRef.current.size > 0) {
      return false;
    }

    const nextIds = new Set(retryingTaskIdsRef.current);
    nextIds.add(taskId);
    retryingTaskIdsRef.current = nextIds;
    setRetryingTaskIds(nextIds);
    return true;
  }

  function releaseTaskRetry(taskId: string) {
    const nextIds = new Set(retryingTaskIdsRef.current);
    nextIds.delete(taskId);
    retryingTaskIdsRef.current = nextIds;
    setRetryingTaskIds(nextIds);
  }

  function resetBatchIdentity() {
    setBatchId(createBatchId());
    setBatchCreatedAt(new Date().toISOString());
    setStartedAt("");
    setCompletedAt("");
    setPauseMessage("");
    cancelRef.current = false;
    pauseRef.current = false;
  }

  function handleClearBatch() {
    if (hasTaskMutationLock()) {
      return;
    }

    const nextCount = clampBatchTaskCount(config.batchDefaultTaskCount);
    resetBatchIdentity();
    setSource("same-prompt");
    setStatus("draft");
    setBatchTitle("");
    setMasterPrompt("");
    setStyleLock("");
    setCustomPromptDrafts(createEmptyPromptDrafts(nextCount));
    setTaskCount(nextCount);
    commitTasks([]);
    setPromptRecipeText("");
    setBatchReferenceImagesWithCleanup([]);
    clearAllTaskReferenceState();
    clearBatchReferenceInput();
    setAppMessage("");
  }

  function clearAllTaskReferenceState() {
    setTaskReferenceImagesById((currentImagesById) => {
      revokeTaskReferenceImages(currentImagesById);
      return {};
    });
    setTaskUsesGlobalReferencesById({});
    setExpandedTaskReferenceIds(new Set());
    taskReferenceDragDepthRef.current = {};
    setTaskReferenceDragOverId(null);
    clearTaskReferenceInputs();
  }

  function clearTaskReferenceInputs(taskIds?: string[]) {
    const ids = taskIds ?? Array.from(taskReferenceInputRefs.current.keys());
    for (const taskId of ids) {
      const input = taskReferenceInputRefs.current.get(taskId);
      if (input) {
        input.value = "";
      }
    }
  }

  function replaceTasksAndClearTaskReferences(nextTasks: BatchTask[]) {
    clearAllTaskReferenceState();
    commitTasks(nextTasks);
  }

  function setBatchReferenceImagesWithCleanup(nextImages: ReferenceImageItem[]) {
    setBatchReferenceImages((currentImages) => {
      const nextIds = new Set(nextImages.map((item) => item.id));
      const removedImages = currentImages.filter((item) => !nextIds.has(item.id));

      if (removedImages.length > 0) {
        revokeReferenceImages(removedImages);
      }

      return nextImages;
    });
  }

  function buildReferenceImagesMessage(result: AddReferenceImagesResult): string {
    const parts: string[] = [];

    if (result.addedCount > 0) {
      parts.push(copy.messages.referenceImagesAdded(result.addedCount, result.images.length));
    }

    if (result.invalidCount > 0) {
      parts.push(copy.messages.referenceImagesInvalidSkipped(result.invalidCount));
    }

    if (result.overflowCount > 0) {
      parts.push(copy.messages.referenceImagesOverflowSkipped(result.overflowCount, MAX_REFERENCE_IMAGES));
    }

    return parts.join(" ").trim();
  }

  function clearBatchReferenceInput() {
    if (batchReferenceInputRef.current) {
      batchReferenceInputRef.current.value = "";
    }
  }

  function addBatchReferenceFiles(files: Iterable<File>) {
    if (isRunning || hasTaskRetryLock()) {
      return;
    }

    const result = addReferenceImages(batchReferenceImages, files);
    setBatchReferenceImagesWithCleanup(result.images);

    const message = buildReferenceImagesMessage(result);
    if (message) {
      setAppMessage(message);
    }
  }

  function handleBatchReferenceImageChange(event: ChangeEvent<HTMLInputElement>) {
    addBatchReferenceFiles(Array.from(event.currentTarget.files ?? []));
    event.currentTarget.value = "";
  }

  function handleRemoveBatchReferenceImage(id: string) {
    if (isRunning || hasTaskRetryLock()) {
      return;
    }

    const removedImage = batchReferenceImages.find((image) => image.id === id);
    if (!removedImage) {
      return;
    }

    setBatchReferenceImagesWithCleanup(batchReferenceImages.filter((image) => image.id !== id));
    setAppMessage(copy.messages.referenceImageRemoved(removedImage.file.name));
  }

  function handleClearBatchReferenceImages() {
    if (isRunning || hasTaskRetryLock()) {
      return;
    }

    if (batchReferenceImages.length === 0) {
      return;
    }

    setBatchReferenceImagesWithCleanup([]);
    clearBatchReferenceInput();
    setAppMessage(copy.messages.referenceImagesCleared);
  }

  function setTaskReferenceImagesWithCleanup(taskId: string, nextImages: ReferenceImageItem[]) {
    setTaskReferenceImagesById((currentImagesById) => {
      const currentImages = currentImagesById[taskId] ?? [];
      const nextIds = new Set(nextImages.map((item) => item.id));
      const removedImages = currentImages.filter((item) => !nextIds.has(item.id));

      if (removedImages.length > 0) {
        revokeReferenceImages(removedImages);
      }

      return {
        ...currentImagesById,
        [taskId]: nextImages,
      };
    });
  }

  function addTaskReferenceFiles(taskId: string, files: Iterable<File>) {
    if (hasTaskMutationLock()) {
      return;
    }

    const currentImages = taskReferenceImagesById[taskId] ?? [];
    const result = addReferenceImages(currentImages, files);
    setTaskReferenceImagesWithCleanup(taskId, result.images);

    const message = buildReferenceImagesMessage(result);
    if (message) {
      setAppMessage(message);
    }
  }

  function handleTaskReferenceImageChange(taskId: string, event: ChangeEvent<HTMLInputElement>) {
    addTaskReferenceFiles(taskId, Array.from(event.currentTarget.files ?? []));
    event.currentTarget.value = "";
  }

  function handleRemoveTaskReferenceImage(taskId: string, imageId: string) {
    if (hasTaskMutationLock()) {
      return;
    }

    const currentImages = taskReferenceImagesById[taskId] ?? [];
    const removedImage = currentImages.find((image) => image.id === imageId);
    if (!removedImage) {
      return;
    }

    setTaskReferenceImagesWithCleanup(
      taskId,
      currentImages.filter((image) => image.id !== imageId),
    );
    setAppMessage(copy.messages.referenceImageRemoved(removedImage.file.name));
  }

  function handleClearTaskReferenceImages(taskId: string) {
    if (hasTaskMutationLock()) {
      return;
    }

    if ((taskReferenceImagesById[taskId] ?? []).length === 0) {
      return;
    }

    setTaskReferenceImagesWithCleanup(taskId, []);
    clearTaskReferenceInputs([taskId]);
    setAppMessage(copy.messages.referenceImagesCleared);
  }

  function handleTaskReferenceToggle(taskId: string, open: boolean) {
    setExpandedTaskReferenceIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (open) {
        nextIds.add(taskId);
      } else {
        nextIds.delete(taskId);
      }
      return nextIds;
    });
  }

  function handleExpandAllTaskReferences() {
    setExpandedTaskReferenceIds(new Set(tasks.map((task) => task.id)));
  }

  function handleCollapseAllTaskReferences() {
    setExpandedTaskReferenceIds(new Set());
  }

  function handleToggleTaskUsesGlobalReferences(taskId: string, checked: boolean) {
    if (hasTaskMutationLock()) {
      return;
    }

    setTaskUsesGlobalReferencesById((currentValues) => ({
      ...currentValues,
      [taskId]: checked,
    }));
  }

  function taskUsesGlobalReferences(taskId: string) {
    return taskUsesGlobalReferencesById[taskId] !== false;
  }

  function getReferenceImagesForTask(task: BatchTask): File[] {
    const globalReferences = taskUsesGlobalReferences(task.id) ? batchReferenceImages.map((image) => image.file) : [];
    const taskReferences = (taskReferenceImagesById[task.id] ?? []).map((image) => image.file);
    return [...globalReferences, ...taskReferences];
  }

  function setTaskReferenceInputRef(taskId: string, node: HTMLInputElement | null) {
    if (node) {
      taskReferenceInputRefs.current.set(taskId, node);
    } else {
      taskReferenceInputRefs.current.delete(taskId);
    }
  }

  function hasDraggedFiles(event: DragEvent<HTMLElement>) {
    return Array.from(event.dataTransfer.types).includes("Files");
  }

  function handleBatchReferenceDragEnter(event: DragEvent<HTMLElement>) {
    if (isTaskListLocked || !hasDraggedFiles(event)) {
      return;
    }

    event.preventDefault();
    batchReferenceDragDepthRef.current += 1;
    setIsBatchReferenceDragOver(true);
  }

  function handleBatchReferenceDragOver(event: DragEvent<HTMLElement>) {
    if (isTaskListLocked || !hasDraggedFiles(event)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleBatchReferenceDragLeave(event: DragEvent<HTMLElement>) {
    if (isTaskListLocked || !hasDraggedFiles(event)) {
      return;
    }

    event.preventDefault();
    batchReferenceDragDepthRef.current = Math.max(0, batchReferenceDragDepthRef.current - 1);
    if (batchReferenceDragDepthRef.current === 0) {
      setIsBatchReferenceDragOver(false);
    }
  }

  function handleBatchReferenceDrop(event: DragEvent<HTMLElement>) {
    if (isTaskListLocked || !hasDraggedFiles(event)) {
      return;
    }

    event.preventDefault();
    batchReferenceDragDepthRef.current = 0;
    setIsBatchReferenceDragOver(false);
    addBatchReferenceFiles(Array.from(event.dataTransfer.files));
  }

  function handleTaskReferenceDragEnter(taskId: string, event: DragEvent<HTMLElement>) {
    if (isTaskMutationLocked || !hasDraggedFiles(event)) {
      return;
    }

    event.preventDefault();
    taskReferenceDragDepthRef.current[taskId] = (taskReferenceDragDepthRef.current[taskId] ?? 0) + 1;
    setTaskReferenceDragOverId(taskId);
  }

  function handleTaskReferenceDragOver(event: DragEvent<HTMLElement>) {
    if (isTaskMutationLocked || !hasDraggedFiles(event)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleTaskReferenceDragLeave(taskId: string, event: DragEvent<HTMLElement>) {
    if (isTaskMutationLocked || !hasDraggedFiles(event)) {
      return;
    }

    event.preventDefault();
    taskReferenceDragDepthRef.current[taskId] = Math.max(0, (taskReferenceDragDepthRef.current[taskId] ?? 0) - 1);
    if (taskReferenceDragDepthRef.current[taskId] === 0) {
      setTaskReferenceDragOverId((currentTaskId) => (currentTaskId === taskId ? null : currentTaskId));
    }
  }

  function handleTaskReferenceDrop(taskId: string, event: DragEvent<HTMLElement>) {
    if (isTaskMutationLocked || !hasDraggedFiles(event)) {
      return;
    }

    event.preventDefault();
    taskReferenceDragDepthRef.current[taskId] = 0;
    setTaskReferenceDragOverId(null);
    addTaskReferenceFiles(taskId, Array.from(event.dataTransfer.files));
  }

  function handleCreateTasks() {
    if (hasTaskMutationLock()) {
      return;
    }

    if (source === "custom-prompts" && !customPromptDrafts.some((prompt) => prompt.trim())) {
      setAppMessage(copy.batch.messages.promptRequired);
      return;
    }

    if (source !== "custom-prompts" && !masterPrompt.trim()) {
      setAppMessage(copy.batch.messages.promptRequired);
      return;
    }

    const nextTasks =
      source === "custom-prompts"
        ? createTasksFromPromptList(customPromptDrafts, { styleLock })
        : createTasksFromRepeatedPrompt(masterPrompt, taskCount, { styleLock });

    if (nextTasks.length === 0) {
      setAppMessage(copy.batch.messages.promptRequired);
      return;
    }

    resetBatchIdentity();
    replaceTasksAndClearTaskReferences(nextTasks);
    setStatus("draft");
    setPromptRecipeText("");
    setAppMessage("");
  }

  async function handleSplitWithTextModel() {
    if (hasTaskMutationLock()) {
      return;
    }

    if (!masterPrompt.trim()) {
      setAppMessage(copy.batch.messages.promptRequired);
      return;
    }

    if (!requireValidConfig(copy.batch.actions.splitWithTextModel)) {
      return;
    }

    isSplittingRef.current = true;
    setIsSplitting(true);
    setAppMessage(copy.batch.messages.splitRunning);

    try {
      const planning = await splitPromptWithTextModel({
        config,
        masterPrompt,
        count: taskCount,
        templateId: splitTemplateId,
        customSystemPrompt: customSplitSystemPrompt,
        styleLock,
        allowAiTaskCountPlanning: config.batchAutoPlanTaskCount,
      });
      const normalizedPlan = normalizeBatchSplitPlan({
        planning,
        initialCount: taskCount,
        allowAiTaskCountPlanning: config.batchAutoPlanTaskCount,
      });

      if (normalizedPlan.status === "invalid") {
        setAppMessage(
          normalizedPlan.reason === "recommended-count-mismatch"
            ? copy.batch.messages.aiCountMismatch(normalizedPlan.expectedCount, normalizedPlan.actualCount)
            : copy.batch.messages.fixedAiCountMismatch(normalizedPlan.expectedCount, normalizedPlan.actualCount),
        );
        return;
      }

      let nextCount = normalizedPlan.status === "ready"
        ? normalizedPlan.taskCount
        : normalizedPlan.maxTaskCount;
      let plannedItems = normalizedPlan.items;
      const didConfirmLimit = normalizedPlan.status === "requires-confirmation";

      if (normalizedPlan.status === "requires-confirmation") {
        const confirmed = window.confirm(
          copy.batch.messages.aiCountOverLimitConfirm(
            normalizedPlan.requestedCount,
            normalizedPlan.maxTaskCount,
          ),
        );
        if (!confirmed) {
          setAppMessage(copy.batch.messages.aiCountOverLimitCancelled);
          return;
        }

        plannedItems = normalizedPlan.items.slice(0, normalizedPlan.maxTaskCount);
      }

      const didAdjustTaskCount = nextCount !== taskCount;

      if (didAdjustTaskCount) {
        setTaskCount(nextCount);
        onConfigChange("batchDefaultTaskCount", nextCount);
        setCustomPromptDrafts((current) => resizePromptDrafts(current, nextCount));
      }

      const nextTasks = createTasksFromSplitResults(plannedItems, { styleLock });

      if (nextTasks.length === 0) {
        setAppMessage(copy.batch.messages.splitFailed("The text model did not return usable tasks."));
        return;
      }

      resetBatchIdentity();
      replaceTasksAndClearTaskReferences(nextTasks);
      setStatus("draft");
      setPromptRecipeText("");
      setAppMessage(
        didConfirmLimit
          ? copy.batch.messages.aiCountLimitedAfterConfirmation(normalizedPlan.requestedCount, nextCount)
          : didAdjustTaskCount
            ? copy.batch.messages.taskCountAdjustedByAi(nextCount, normalizedPlan.countReason)
          : copy.batch.messages.splitSuccess(nextTasks.length),
      );
    } catch (error) {
      setAppMessage(copy.batch.messages.splitFailed(error instanceof Error ? error.message : "Unknown error."));
    } finally {
      isSplittingRef.current = false;
      setIsSplitting(false);
    }
  }

  function updateTaskCount(rawValue: number) {
    if (hasTaskMutationLock()) {
      return;
    }

    const nextCount = clampBatchTaskCount(rawValue);
    if (rawValue > MAX_BATCH_TASK_COUNT) {
      setAppMessage(copy.batch.messages.maxTaskCountWarning(MAX_BATCH_TASK_COUNT));
    }

    setTaskCount(nextCount);
    onConfigChange("batchDefaultTaskCount", nextCount);
    setCustomPromptDrafts((current) => resizePromptDrafts(current, nextCount));
  }

  function handleUpdateCustomPrompt(index: number, value: string) {
    if (hasTaskMutationLock()) {
      return;
    }

    setCustomPromptDrafts((current) => current.map((prompt, itemIndex) => (itemIndex === index ? value : prompt)));
  }

  function handleAddCustomPrompt() {
    if (hasTaskMutationLock()) {
      return;
    }

    if (customPromptDrafts.length >= MAX_BATCH_TASK_COUNT) {
      setAppMessage(copy.batch.messages.maxTaskCountWarning(MAX_BATCH_TASK_COUNT));
      return;
    }

    updateTaskCount(customPromptDrafts.length + 1);
  }

  function handleRemoveCustomPrompt(index: number) {
    if (hasTaskMutationLock()) {
      return;
    }

    if (customPromptDrafts.length <= 1) {
      return;
    }

    const nextDrafts = customPromptDrafts.filter((_, itemIndex) => itemIndex !== index);
    setCustomPromptDrafts(nextDrafts);
    setTaskCount(nextDrafts.length);
    onConfigChange("batchDefaultTaskCount", nextDrafts.length);
  }

  function handleUpdateTask(id: string, patch: Partial<Pick<BatchTask, "title" | "prompt">>) {
    if (hasTaskMutationLock()) {
      return;
    }

    commitTasks((current) =>
      current.map((task) => {
        if (task.id !== id) {
          return task;
        }

        const promptChanged = patch.prompt !== undefined && patch.prompt !== task.prompt;
        const titleChanged = patch.title !== undefined && patch.title !== task.title;
        return {
          ...task,
          ...patch,
          ...(titleChanged ? { suggestedName: undefined } : null),
          ...(promptChanged
            ? {
                status: "pending" as const,
                attemptCount: 0,
                errorMessage: "",
                failureCategory: null,
                outputPath: "",
                previewUrl: "",
                durationMs: 0,
                startedAt: "",
                completedAt: "",
              }
            : null),
        };
      }),
    );
    setPromptRecipeText("");
  }

  function handleDeleteTask(id: string) {
    if (hasTaskMutationLock()) {
      return;
    }

    commitTasks((current) => renumberBatchTasks(current.filter((task) => task.id !== id)));
    setTaskReferenceImagesById((currentImagesById) => {
      const removedImages = currentImagesById[id] ?? [];
      if (removedImages.length > 0) {
        revokeReferenceImages(removedImages);
      }
      const { [id]: _removed, ...remainingImagesById } = currentImagesById;
      return remainingImagesById;
    });
    setTaskUsesGlobalReferencesById((currentValues) => {
      const { [id]: _removed, ...remainingValues } = currentValues;
      return remainingValues;
    });
    setExpandedTaskReferenceIds((currentIds) => {
      const nextIds = new Set(currentIds);
      nextIds.delete(id);
      return nextIds;
    });
    clearTaskReferenceInputs([id]);
    setPromptRecipeText("");
  }

  function createPromptRecipeText(): string {
    const recipe = buildBatchPromptRecipe({
      title: batchDisplayTitle,
      source,
      masterPrompt: source === "custom-prompts" ? customPromptDrafts.filter(Boolean).join("\n") : masterPrompt,
      styleLock,
      taskCount,
      splitTemplateId,
      customSplitSystemPrompt,
      executionConfig,
      tasks,
    });
    const text = formatBatchPromptRecipe(recipe);
    setPromptRecipeText(text);
    setAppMessage(copy.batch.messages.recipeReady);
    return text;
  }

  async function handleCopyPromptRecipe() {
    const text = promptRecipeText || createPromptRecipeText();
    if (!navigator.clipboard?.writeText) {
      setAppMessage(copy.batch.messages.recipeCopyUnavailable);
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setAppMessage(copy.batch.messages.recipeCopied);
    } catch (error) {
      setAppMessage(copy.batch.messages.recipeCopyFailed(error instanceof Error ? error.message : "Unknown error."));
    }
  }

  async function persistManifest(nextStatus: BatchStatus, nextTasks: BatchTask[], manifestStartedAt: string) {
    if (!runtime) {
      return;
    }

    const finishedAt = new Date().toISOString();
    const manifest = buildBatchManifest({
      id: batchId,
      title: batchDisplayTitle,
      source,
      createdAt: batchCreatedAt,
      startedAt: manifestStartedAt || startedAt,
      completedAt: finishedAt,
      executionConfig,
      config,
      tasks: nextTasks,
    });

    await runtime.saveBatchManifest(manifest);
    setCompletedAt(finishedAt);
    setStatus(nextStatus);
  }

  async function handleStartBatch(tasksOverride?: BatchTask[]) {
    const targetTasks = tasksOverride ?? latestTasksRef.current;
    if (!runtime || targetTasks.length === 0 || hasTaskMutationLock()) {
      return;
    }

    if (!requireValidConfig(copy.batch.actions.start)) {
      return;
    }

    cancelRef.current = false;
    pauseRef.current = false;
    const nextStartedAt = startedAt || new Date().toISOString();
    setStartedAt(nextStartedAt);
    setCompletedAt("");
    setStatus("running");
    setPauseMessage("");
    setAppMessage("");

    try {
      const result = await runBatchTasks({
        batchId,
        batchTitle: batchDisplayTitle,
        batchCreatedAt,
        config,
        tasks: targetTasks,
        executionConfig,
        referenceImages: batchReferenceImages.map((image) => image.file),
        getTaskReferenceImages: getReferenceImagesForTask,
        saveBatchImage: runtime.saveBatchImage.bind(runtime),
        onTaskUpdate: (nextTasks) => {
          commitTasks([...nextTasks]);
          const done = nextTasks.filter(
            (task) => task.status === "succeeded" || task.status === "failed" || task.status === "skipped",
          ).length;
          updateBatchDocumentTitle(done, nextTasks.length);
        },
        shouldCancel: () => cancelRef.current,
        shouldPause: () => pauseRef.current,
      });

      commitTasks(result.tasks);
      if (result.pauseReason?.failureCategory === "cost_risk") {
        setPauseMessage(copy.batch.messages.costRiskPaused);
      } else if (result.pauseReason?.failureCategory === "auth") {
        setPauseMessage(copy.batch.messages.authPaused);
      }

      await persistManifest(result.status, result.tasks, nextStartedAt);
      await onHistoryChanged();
      const nextSummary = summarizeBatchTasks(result.tasks);
      const message = copy.batch.messages.batchComplete(
        nextSummary.succeeded,
        nextSummary.failed,
        nextSummary.skipped,
      );
      setAppMessage(message);
      await notifyBatchComplete(copy.batch.title, message);
    } catch (error) {
      setStatus("paused");
      setPauseMessage(error instanceof Error ? error.message : "Batch execution failed.");
    } finally {
      restoreDocumentTitle();
    }
  }

  function handlePauseBatch() {
    pauseRef.current = true;
  }

  function handleCancelBatch() {
    cancelRef.current = true;
  }

  async function handleRetryFailedTasks() {
    if (!hasFailedTasks || hasTaskMutationLock()) {
      return;
    }

    const nextTasks = resetFailedBatchTasks(latestTasksRef.current);
    commitTasks(nextTasks);
    setStatus("draft");
    setPauseMessage("");
    setPromptRecipeText("");
    await handleStartBatch(nextTasks);
  }

  async function handleRetryTask(task: BatchTask) {
    if (!runtime || hasTaskMutationLock()) {
      return;
    }

    if (!requireValidConfig(copy.batch.actions.retryTask)) {
      return;
    }

    if (!acquireTaskRetry(task.id)) {
      return;
    }

    const nextStartedAt = startedAt || new Date().toISOString();
    setStartedAt(nextStartedAt);
    setCompletedAt("");
    const latestTask = latestTasksRef.current.find((item) => item.id === task.id) ?? task;
    commitTasks((current) =>
      current.map((item) =>
        item.id === task.id
          ? { ...item, status: "running", errorMessage: "", failureCategory: null, completedAt: "" }
          : item,
      ),
    );

    try {
      const retried = await retrySingleBatchTask({
        batchId,
        batchTitle: batchDisplayTitle,
        batchCreatedAt,
        config,
        task: latestTask,
        referenceImages: getReferenceImagesForTask(latestTask),
        saveBatchImage: runtime.saveBatchImage.bind(runtime),
      });
      const finalTasks = mergeRetriedBatchTask(latestTasksRef.current, retried);
      commitTasks(finalTasks);
      await persistManifest("completed", finalTasks, nextStartedAt);
      await onHistoryChanged();
    } finally {
      releaseTaskRetry(task.id);
    }
  }

  return (
    <div className="panel-body form-stack batch-panel">
      <div className="batch-source-grid">
        {([
          ["same-prompt", copy.batch.sources.samePrompt],
          ["custom-prompts", copy.batch.sources.customPrompts],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            data-testid={`batch-source-${value}`}
            className={`source-card ${source === value ? "active" : ""}`}
            onClick={() => {
              if (!hasTaskMutationLock()) {
                setSource(value);
              }
            }}
            disabled={isTaskMutationLocked}
          >
            {label}
          </button>
        ))}
      </div>

      {renderOutputOptions?.(isTaskListLocked)}

      <details className="batch-advanced-export batch-reference-section">
        <summary>
          <span>{copy.batch.referenceImages.title}</span>
          <small>{copy.batch.referenceImages.summary(batchReferenceImages.length, MAX_REFERENCE_IMAGES)}</small>
        </summary>
        <div className="batch-advanced-export-body batch-reference-section-body">
          <div
            className={`reference-dropzone ${isBatchReferenceDragOver ? "drag-over" : ""}`}
            onDragEnter={handleBatchReferenceDragEnter}
            onDragOver={handleBatchReferenceDragOver}
            onDragLeave={handleBatchReferenceDragLeave}
            onDrop={handleBatchReferenceDrop}
          >
            <div className="reference-dropzone-copy">
              <strong>{copy.batch.referenceImages.title}</strong>
              <p>{copy.batch.referenceImages.description}</p>
              <p>
                {copy.fields.referenceImagePlaceholder} {copy.notes.dragAndDropHint}
              </p>
              <p>{copy.notes.referenceImageLimitHint}</p>
            </div>
            <input
              ref={batchReferenceInputRef}
              className="hidden-file-input"
              type="file"
              accept="image/*"
              multiple
              aria-label={copy.batch.referenceImages.title}
              disabled={isTaskListLocked}
              onChange={handleBatchReferenceImageChange}
            />
            <div className="action-row">
              <button
                type="button"
                className="secondary-button"
                onClick={() => batchReferenceInputRef.current?.click()}
                disabled={isTaskListLocked}
              >
                {batchReferenceImages.length > 0 ? copy.actions.changeImage : copy.actions.chooseImage}
              </button>
              {batchReferenceImages.length > 0 ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleClearBatchReferenceImages}
                  disabled={isTaskListLocked}
                >
                  {copy.actions.clearImages}
                </button>
              ) : null}
            </div>
          </div>

          <div className="reference-summary">
            <span>{copy.batch.referenceImages.scopeHint}</span>
          </div>

          {batchReferenceImages.length > 0 ? (
            <div className="reference-grid">
              {batchReferenceImages.map((image) => (
                <article key={image.id} className="reference-card">
                  <div className="reference-preview">
                    <img src={image.previewUrl} alt={image.file.name} />
                  </div>
                  <div className="reference-details">
                    <strong>{image.file.name}</strong>
                    <span>{formatFileSize(image.file.size, language)}</span>
                  </div>
                  <button
                    type="button"
                    className="ghost-button reference-remove-button"
                    onClick={() => handleRemoveBatchReferenceImage(image.id)}
                    disabled={isTaskListLocked}
                  >
                    {copy.actions.removeImage}
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="reference-empty">
              <p>{copy.empty.noReferenceImages}</p>
            </div>
          )}
        </div>
      </details>

      <label className="field">
        <span>{copy.batch.fields.batchTitle}</span>
        <input value={batchTitle} disabled={isTaskListLocked} onChange={(event) => setBatchTitle(event.target.value)} />
      </label>

      <label className="field batch-style-lock-field">
        <span>{copy.batch.fields.styleLock}</span>
        <textarea
          className="batch-style-lock-textarea"
          value={styleLock}
          rows={3}
          disabled={isTaskMutationLocked}
          placeholder={copy.batch.workflow.styleLockPlaceholder}
          onChange={(event) => {
            if (!hasTaskMutationLock()) {
              setStyleLock(event.target.value);
              setPromptRecipeText("");
            }
          }}
        />
        <small className="inline-note">
          {tasks.length > 0 && !isTaskMutationLocked
            ? copy.batch.workflow.styleLockGeneratedHint
            : copy.batch.workflow.styleLockHint}
        </small>
      </label>

      {source === "custom-prompts" ? (
        <div className="custom-prompt-list">
          {customPromptDrafts.map((prompt, index) => (
            <article key={index} className="custom-prompt-draft">
              <label className="field">
                <span>{copy.batch.fields.customPrompt(index + 1)}</span>
                <textarea
                  data-testid={`batch-custom-prompt-${index}`}
                  className="batch-task-prompt-textarea"
                  value={prompt}
                  rows={3}
                  disabled={isTaskMutationLocked}
                  onChange={(event) => handleUpdateCustomPrompt(index, event.target.value)}
                />
              </label>
              <button
                type="button"
                className="ghost-button custom-prompt-remove"
                onClick={() => handleRemoveCustomPrompt(index)}
                disabled={isTaskMutationLocked || customPromptDrafts.length <= 1}
              >
                {copy.batch.actions.removePrompt}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <>
          <label className="field">
            <span>{copy.batch.fields.masterPrompt}</span>
            <textarea
              className="prompt-textarea"
              value={masterPrompt}
              rows={6}
              disabled={isTaskMutationLocked}
              onChange={(event) => {
                if (!hasTaskMutationLock()) {
                  setMasterPrompt(event.target.value);
                }
              }}
            />
          </label>
          <section className="batch-split-card" aria-label={copy.batch.aiSplit.title}>
            <div>
              <h3>{copy.batch.aiSplit.title}</h3>
              <p>{copy.batch.aiSplit.description}</p>
            </div>
            <label className="field">
              <span>{copy.batch.fields.splitTemplate}</span>
              <select
                value={splitTemplateId}
                disabled={isTaskMutationLocked}
                onChange={(event) => {
                  if (!hasTaskMutationLock()) {
                    setSplitTemplateId(event.target.value as BatchSplitTemplateId);
                  }
                }}
              >
                {BUILT_IN_BATCH_SPLIT_TEMPLATES.map((template) => (
                  <option key={template.id} value={template.id}>
                    {copy.batch.splitTemplates[template.id].label}
                  </option>
                ))}
                <option value="custom">{copy.batch.splitTemplates.custom.label}</option>
              </select>
            </label>
            {splitTemplateId === "custom" ? (
              <label className="field">
                <span>{copy.batch.fields.customSplitSystemPrompt}</span>
                <textarea
                  className="batch-task-prompt-textarea"
                  value={customSplitSystemPrompt}
                  rows={4}
                  disabled={isTaskMutationLocked}
                  onChange={(event) => {
                    if (!hasTaskMutationLock()) {
                      setCustomSplitSystemPrompt(event.target.value);
                    }
                  }}
                />
              </label>
            ) : (
              <p className="panel-note">{copy.batch.splitTemplates[splitTemplateId].description}</p>
            )}
            <details className="batch-advanced-export batch-split-guide">
              <summary>{copy.batch.aiSplit.guideTitle}</summary>
              <div className="batch-advanced-export-body split-template-guide">
                <div className="split-template-guide-grid">
                  {(["basic", "style-consistent", "series", "custom"] as const).map((templateId) => (
                    <button
                      key={templateId}
                      type="button"
                      className={`split-template-guide-item ${splitTemplateId === templateId ? "active" : ""}`}
                      onClick={() => {
                        if (!hasTaskMutationLock()) {
                          setSplitTemplateId(templateId);
                        }
                      }}
                      disabled={isTaskMutationLocked}
                    >
                      <span>{copy.batch.splitTemplates[templateId].label}</span>
                      <small>{copy.batch.splitTemplates[templateId].useCase}</small>
                    </button>
                  ))}
                </div>
              </div>
            </details>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void handleSplitWithTextModel()}
              disabled={isTaskMutationLocked}
            >
              {isSplitting ? copy.batch.actions.splitBusy : copy.batch.actions.splitWithTextModel}
            </button>
          </section>
        </>
      )}

      <div className="field-grid">
        <label className="field">
          <span>{copy.batch.fields.taskCount}</span>
          <input
            type="number"
            min={1}
            max={MAX_BATCH_TASK_COUNT}
            value={taskCount}
            disabled={isTaskMutationLocked}
            onChange={(event) => updateTaskCount(Number(event.target.value) || 1)}
          />
        </label>
        <label className="field">
          <span>{copy.batch.fields.concurrency}</span>
          <input
            type="number"
            min={1}
            max={MAX_BATCH_CONCURRENCY}
            value={config.batchDefaultConcurrency}
            disabled={isTaskListLocked}
            onChange={(event) =>
              onConfigChange("batchDefaultConcurrency", clampBatchConcurrency(Number(event.target.value) || 1))
            }
          />
        </label>
        <label className="field">
          <span>{copy.batch.fields.intervalSeconds}</span>
          <input
            type="number"
            min={0}
            max={300}
            value={config.batchDefaultIntervalSeconds}
            disabled={isTaskListLocked}
            onChange={(event) => onConfigChange("batchDefaultIntervalSeconds", Number(event.target.value) || 0)}
          />
        </label>
        <label className="field">
          <span>{copy.batch.fields.maxRetries}</span>
          <input
            type="number"
            min={0}
            max={3}
            value={config.batchDefaultMaxRetries}
            disabled={isTaskListLocked}
            onChange={(event) => onConfigChange("batchDefaultMaxRetries", Number(event.target.value) || 0)}
          />
        </label>
      </div>

      <details className="batch-advanced-export batch-execution-notes">
        <summary>{copy.batch.fields.executionNotes}</summary>
        <div className="batch-advanced-export-body">
          <p>{copy.batch.defaultsNote}</p>
        </div>
      </details>

      <details className="batch-advanced-export">
        <summary>{copy.batch.recipe.advancedTitle}</summary>
        <div className="batch-advanced-export-body">
          <p>{copy.batch.recipe.description}</p>
          <div className="action-row">
            <button
              type="button"
              className="secondary-button"
              onClick={createPromptRecipeText}
              disabled={isTaskListLocked}
            >
              {copy.batch.actions.generateRecipe}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void handleCopyPromptRecipe()}
              disabled={isTaskListLocked}
            >
              {copy.batch.actions.copyRecipe}
            </button>
          </div>
        </div>
      </details>

      {promptRecipeText ? (
        <section className="batch-export-card">
          <div>
            <h3>{copy.batch.recipe.title}</h3>
            <p>{copy.batch.recipe.outputDescription}</p>
          </div>
          <textarea readOnly value={promptRecipeText} rows={8} aria-label={copy.batch.recipe.title} />
        </section>
      ) : null}

      <div className="action-row">
        {source === "custom-prompts" ? (
          <button
            type="button"
            className="secondary-button"
            onClick={handleAddCustomPrompt}
            disabled={isTaskMutationLocked}
          >
            {copy.batch.actions.addPrompt}
          </button>
        ) : null}
        <button
          type="button"
          className="secondary-button"
          data-testid="batch-create-tasks"
          onClick={handleCreateTasks}
          disabled={isTaskMutationLocked}
        >
          {copy.batch.actions.createTasks}
        </button>
      </div>

      <div className="info-card batch-summary-card">
        <h3>{copy.batch.title}</h3>
        <p>{copy.batch.description}</p>
        <dl>
          <div>
            <dt>{copy.labels.status}</dt>
            <dd>{copy.batch.status[status]}</dd>
          </div>
          <div>
            <dt>{copy.labels.totalRecords}</dt>
            <dd>{summary.total}</dd>
          </div>
          <div>
            <dt>{copy.batch.status.succeeded}</dt>
            <dd>{summary.succeeded}</dd>
          </div>
          <div>
            <dt>{copy.batch.status.failed}</dt>
            <dd>{summary.failed}</dd>
          </div>
          <div>
            <dt>{copy.batch.status.skipped}</dt>
            <dd>{summary.skipped}</dd>
          </div>
        </dl>
        {hasExecutedTasks ? (
          <p className="panel-note" data-testid="batch-save-summary">
            {copy.batch.messages.saveSummary(summary.succeeded, saveSummary.authorized, saveSummary.fallback)}
          </p>
        ) : null}
        {startedAt ? (
          <p className="panel-note">
            {startedAt}
            {completedAt ? ` - ${completedAt}` : ""}
          </p>
        ) : null}
      </div>

      {pauseMessage ? <div className="message-card warning">{pauseMessage}</div> : null}

      <div className="action-row batch-execution-row">
        <button
          type="button"
          className="primary-button"
          data-testid="batch-start"
          onClick={() => void handleStartBatch()}
          disabled={!runtime || tasks.length === 0 || isTaskMutationLocked}
        >
          {primaryBatchActionLabel}
        </button>
        <button type="button" className="secondary-button" onClick={handlePauseBatch} disabled={!isRunning}>
          {copy.batch.actions.pause}
        </button>
        <button type="button" className="secondary-button" onClick={handleCancelBatch} disabled={!isRunning}>
          {copy.batch.actions.cancel}
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={() => void handleRetryFailedTasks()}
          disabled={!runtime || isTaskMutationLocked || !hasFailedTasks}
        >
          {copy.batch.actions.retryFailed}
        </button>
        <button type="button" className="secondary-button" onClick={handleClearBatch} disabled={isTaskMutationLocked}>
          {copy.batch.actions.clearDraft}
        </button>
      </div>

      {tasks.length === 0 ? (
        <div className="empty-state">{copy.batch.emptyTasks}</div>
      ) : (
        <>
          <div className="action-row task-reference-bulk-row">
            <button type="button" className="secondary-button" onClick={handleExpandAllTaskReferences}>
              {copy.batch.referenceImages.expandAllTaskReferences}
            </button>
            <button type="button" className="secondary-button" onClick={handleCollapseAllTaskReferences}>
              {copy.batch.referenceImages.collapseAllTaskReferences}
            </button>
          </div>
          <div className="batch-task-list">
            {tasks.map((task) => {
              const taskReferenceImages = taskReferenceImagesById[task.id] ?? [];
              const useGlobalReferences = taskUsesGlobalReferences(task.id);
              const taskNumber = task.index + 1;

              return (
                <article key={task.id} className={`batch-task-card ${task.status}`}>
                  <div className="batch-task-index">{String(taskNumber).padStart(2, "0")}</div>
                  <div className="batch-task-main">
                    <label className="field batch-task-name-field">
                      <span>{copy.fields.customName}</span>
                      <input
                        value={task.title}
                        disabled={isTaskMutationLocked}
                        onChange={(event) => handleUpdateTask(task.id, { title: event.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span>{copy.fields.prompt}</span>
                      <textarea
                        className="batch-task-prompt-textarea"
                        value={task.prompt}
                        rows={3}
                        disabled={isTaskMutationLocked}
                        onChange={(event) => handleUpdateTask(task.id, { prompt: event.target.value })}
                      />
                    </label>
                    {task.suggestedName || task.plannerNotes ? (
                      <div className="batch-task-planner-note">
                        {task.suggestedName ? (
                          <p>
                            <strong>{copy.batch.fields.suggestedName}</strong>
                            <span>{task.suggestedName}</span>
                          </p>
                        ) : null}
                        {task.plannerNotes ? (
                          <p>
                            <strong>{copy.batch.fields.plannerNotes}</strong>
                            <span>{task.plannerNotes}</span>
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    <details
                      className="batch-advanced-export task-reference-section"
                      open={expandedTaskReferenceIds.has(task.id)}
                      onToggle={(event) => handleTaskReferenceToggle(task.id, event.currentTarget.open)}
                    >
                      <summary>
                        <span>{copy.batch.referenceImages.taskTitle}</span>
                        <small>
                          {copy.batch.referenceImages.taskSummary(taskReferenceImages.length, MAX_REFERENCE_IMAGES)}
                          {useGlobalReferences && batchReferenceImages.length > 0
                            ? ` · ${copy.batch.referenceImages.usesGlobalHint}`
                            : ""}
                        </small>
                      </summary>
                      <div className="batch-advanced-export-body task-reference-section-body">
                        <label className="toggle-row task-reference-global-toggle">
                          <input
                            type="checkbox"
                            checked={useGlobalReferences}
                            disabled={isTaskMutationLocked}
                            aria-label={copy.batch.referenceImages.useGlobalForTask(taskNumber)}
                            onChange={(event) => handleToggleTaskUsesGlobalReferences(task.id, event.currentTarget.checked)}
                          />
                          <span>{copy.batch.referenceImages.useGlobalLabel}</span>
                        </label>
                        <div
                          className={`reference-dropzone task-reference-dropzone ${
                            taskReferenceDragOverId === task.id ? "drag-over" : ""
                          }`}
                          onDragEnter={(event) => handleTaskReferenceDragEnter(task.id, event)}
                          onDragOver={handleTaskReferenceDragOver}
                          onDragLeave={(event) => handleTaskReferenceDragLeave(task.id, event)}
                          onDrop={(event) => handleTaskReferenceDrop(task.id, event)}
                        >
                          <div className="reference-dropzone-copy">
                            <strong>{copy.batch.referenceImages.taskTitle}</strong>
                            <p>{copy.batch.referenceImages.taskDescription}</p>
                            <p>
                              {copy.fields.referenceImagePlaceholder} {copy.notes.dragAndDropHint}
                            </p>
                            <p>{copy.notes.referenceImageLimitHint}</p>
                          </div>
                          <input
                            ref={(node) => setTaskReferenceInputRef(task.id, node)}
                            className="hidden-file-input"
                            type="file"
                            accept="image/*"
                            multiple
                            aria-label={copy.batch.referenceImages.taskInputLabel(taskNumber)}
                            disabled={isTaskMutationLocked}
                            onChange={(event) => handleTaskReferenceImageChange(task.id, event)}
                          />
                          <div className="action-row">
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => taskReferenceInputRefs.current.get(task.id)?.click()}
                              disabled={isTaskMutationLocked}
                            >
                              {taskReferenceImages.length > 0 ? copy.actions.changeImage : copy.actions.chooseImage}
                            </button>
                            {taskReferenceImages.length > 0 ? (
                              <button
                                type="button"
                                className="secondary-button"
                                onClick={() => handleClearTaskReferenceImages(task.id)}
                                disabled={isTaskMutationLocked}
                              >
                                {copy.actions.clearImages}
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <div className="reference-summary task-reference-summary">
                          <span>{copy.batch.referenceImages.taskScopeHint}</span>
                          <span>{copy.batch.referenceImages.taskSessionHint}</span>
                        </div>
                        {taskReferenceImages.length > 0 ? (
                          <div className="reference-grid task-reference-grid">
                            {taskReferenceImages.map((image) => (
                              <article key={image.id} className="reference-card">
                                <div className="reference-preview">
                                  <img src={image.previewUrl} alt={image.file.name} />
                                </div>
                                <div className="reference-details">
                                  <strong>{image.file.name}</strong>
                                  <span>{formatFileSize(image.file.size, language)}</span>
                                </div>
                                <button
                                  type="button"
                                  className="ghost-button reference-remove-button"
                                  onClick={() => handleRemoveTaskReferenceImage(task.id, image.id)}
                                  disabled={isTaskMutationLocked}
                                >
                                  {copy.actions.removeImage}
                                </button>
                              </article>
                            ))}
                          </div>
                        ) : (
                          <div className="reference-empty">
                            <p>{copy.empty.noReferenceImages}</p>
                          </div>
                        )}
                      </div>
                    </details>
                    <div className="batch-task-meta">
                      <span className={`status-pill ${task.status}`}>{copy.batch.status[task.status]}</span>
                      <span>
                        {task.attemptCount} / {executionConfig.maxRetries + 1}
                      </span>
                      {task.durationMs > 0 ? <span>{Math.round(task.durationMs / 1000)}s</span> : null}
                      {task.outputPath ? <span>{task.outputPath}</span> : null}
                    </div>
                    {task.errorMessage ? <p className="error-copy">{task.errorMessage}</p> : null}
                    {task.status === "succeeded" && task.saveMode === "browser-download" && task.saveFallbackReason ? (
                      <p className="warning-copy" data-testid={`batch-save-fallback-task-${task.id}`}>
                        {copy.messages.saveFallbackToBrowserDownload(task.saveFallbackReason)}
                      </p>
                    ) : null}
                    <div className="action-row batch-task-actions">
                      {task.previewUrl ? <img className="batch-task-thumb" src={task.previewUrl} alt={task.title} /> : null}
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => handleDeleteTask(task.id)}
                        disabled={isTaskMutationLocked}
                      >
                        {copy.actions.removeImage}
                      </button>
                      {task.status === "failed" ? (
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => void handleRetryTask(task)}
                          disabled={isTaskMutationLocked}
                        >
                          {copy.batch.actions.retryTask}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function createEmptyPromptDrafts(count: number): string[] {
  return Array.from({ length: clampBatchTaskCount(count) }, () => "");
}

function resizePromptDrafts(current: string[], count: number): string[] {
  const nextCount = clampBatchTaskCount(count);
  if (current.length === nextCount) {
    return current;
  }

  if (current.length > nextCount) {
    return current.slice(0, nextCount);
  }

  return [...current, ...Array.from({ length: nextCount - current.length }, () => "")];
}

function revokeReferenceImages(images: ReferenceImageItem[]) {
  for (const image of images) {
    URL.revokeObjectURL(image.previewUrl);
  }
}

function revokeTaskReferenceImages(imagesById: Record<string, ReferenceImageItem[]>) {
  for (const images of Object.values(imagesById)) {
    revokeReferenceImages(images);
  }
}

function formatFileSize(bytes: number, language: UiLanguage): string {
  if (bytes < 1024) {
    return new Intl.NumberFormat(language).format(bytes) + " B";
  }

  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) {
    return `${new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(kilobytes)} KB`;
  }

  const megabytes = kilobytes / 1024;
  return `${new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(megabytes)} MB`;
}
