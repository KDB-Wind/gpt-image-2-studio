import { useMemo, useRef, useState } from "react";

import { buildBatchManifest, summarizeBatchTasks } from "../core/batchManifest";
import { notifyBatchComplete, restoreDocumentTitle, updateBatchDocumentTitle } from "../core/batchNotifications";
import {
  createTasksFromMultilinePrompts,
  createTasksFromRepeatedPrompt,
  createTasksFromSplitResults,
  renumberBatchTasks,
} from "../core/batchPlanner";
import { splitPromptWithTextModel } from "../core/batchPromptSplitter";
import { retrySingleBatchTask, runBatchTasks } from "../core/batchRunner";
import {
  clampBatchExecutionConfig,
  createBatchId,
  type BatchExecutionConfig,
  type BatchSource,
  type BatchStatus,
  type BatchTask,
} from "../core/batchTypes";
import type { AppConfig } from "../core/config";
import { getTranslations, type UiLanguage } from "../i18n/translations";
import type { RuntimeAdapter } from "../runtime/types";

type BatchPanelProps = {
  config: AppConfig;
  runtime: RuntimeAdapter | null;
  language: UiLanguage;
  referenceImages: File[];
  onConfigChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
  onHistoryChanged: () => Promise<void>;
  requireValidConfig: (actionLabel: string) => boolean;
  setAppMessage: (message: string) => void;
};

export function BatchPanel({
  config,
  runtime,
  language,
  referenceImages,
  onConfigChange,
  onHistoryChanged,
  requireValidConfig,
  setAppMessage,
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
  const [multilinePrompts, setMultilinePrompts] = useState("");
  const [taskCount, setTaskCount] = useState(10);
  const [tasks, setTasks] = useState<BatchTask[]>([]);
  const [isSplitting, setIsSplitting] = useState(false);
  const [pauseMessage, setPauseMessage] = useState("");
  const cancelRef = useRef(false);
  const pauseRef = useRef(false);

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
  const isRunning = status === "running";
  const batchDisplayTitle = batchTitle.trim() || "batch-images";

  function resetBatchIdentity() {
    setBatchId(createBatchId());
    setBatchCreatedAt(new Date().toISOString());
    setStartedAt("");
    setCompletedAt("");
    setPauseMessage("");
    cancelRef.current = false;
    pauseRef.current = false;
  }

  function handleCreateTasks() {
    if (source === "multi-line" && !multilinePrompts.trim()) {
      setAppMessage(copy.batch.messages.promptRequired);
      return;
    }

    if (source !== "multi-line" && !masterPrompt.trim()) {
      setAppMessage(copy.batch.messages.promptRequired);
      return;
    }

    const nextTasks =
      source === "multi-line"
        ? createTasksFromMultilinePrompts(multilinePrompts)
        : createTasksFromRepeatedPrompt(masterPrompt, taskCount);

    if (nextTasks.length === 0) {
      setAppMessage(copy.batch.messages.promptRequired);
      return;
    }

    resetBatchIdentity();
    setTasks(nextTasks);
    setStatus("draft");
  }

  async function handleSplitWithAi() {
    if (!masterPrompt.trim()) {
      setAppMessage(copy.batch.messages.promptRequired);
      return;
    }

    if (!requireValidConfig(copy.batch.actions.splitWithAi)) {
      return;
    }

    setIsSplitting(true);
    try {
      const items = await splitPromptWithTextModel({
        config,
        masterPrompt,
        count: taskCount,
        templateId: config.batchLastSplitTemplateId,
        customSystemPrompt: config.batchCustomSplitSystemPrompt,
      });
      const nextTasks = createTasksFromSplitResults(items);
      resetBatchIdentity();
      setTasks(nextTasks);
      setSource("ai-split");
      setStatus("draft");
      setAppMessage(copy.batch.messages.splitSuccess(nextTasks.length));
    } catch (error) {
      setAppMessage(copy.batch.messages.splitFailed(error instanceof Error ? error.message : "Unknown error"));
    } finally {
      setIsSplitting(false);
    }
  }

  function handleUpdateTask(id: string, patch: Partial<Pick<BatchTask, "title" | "prompt">>) {
    setTasks((current) =>
      current.map((task) => {
        if (task.id !== id) {
          return task;
        }

        const promptChanged = patch.prompt !== undefined && patch.prompt !== task.prompt;
        return {
          ...task,
          ...patch,
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
  }

  function handleDeleteTask(id: string) {
    setTasks((current) => renumberBatchTasks(current.filter((task) => task.id !== id)));
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

  async function handleStartBatch() {
    if (!runtime || tasks.length === 0 || isRunning) {
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

    try {
      const result = await runBatchTasks({
        batchId,
        batchTitle: batchDisplayTitle,
        batchCreatedAt,
        config,
        tasks,
        executionConfig,
        referenceImages,
        saveBatchImage: runtime.saveBatchImage.bind(runtime),
        onTaskUpdate: (nextTasks) => {
          setTasks([...nextTasks]);
          const done = nextTasks.filter(
            (task) => task.status === "succeeded" || task.status === "failed" || task.status === "skipped",
          ).length;
          updateBatchDocumentTitle(done, nextTasks.length);
        },
        shouldCancel: () => cancelRef.current,
        shouldPause: () => pauseRef.current,
      });

      setTasks(result.tasks);
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

  async function handleRetryTask(task: BatchTask) {
    if (!runtime || isRunning) {
      return;
    }

    if (!requireValidConfig(copy.batch.actions.retryTask)) {
      return;
    }

    const nextStartedAt = startedAt || new Date().toISOString();
    setStartedAt(nextStartedAt);
    setCompletedAt("");
    setTasks((current) =>
      current.map((item) =>
        item.id === task.id
          ? { ...item, status: "running", errorMessage: "", failureCategory: null, completedAt: "" }
          : item,
      ),
    );

    const retried = await retrySingleBatchTask({
      batchId,
      batchTitle: batchDisplayTitle,
      batchCreatedAt,
      config,
      task,
      referenceImages,
      saveBatchImage: runtime.saveBatchImage.bind(runtime),
    });
    const nextTasks = tasks.map((item) => (item.id === task.id ? retried : item));
    setTasks(nextTasks);
    await persistManifest("completed", nextTasks, nextStartedAt);
    await onHistoryChanged();
  }

  return (
    <div className="panel-body form-stack batch-panel">
      <div className="batch-source-grid">
        {([
          ["same-prompt", copy.batch.sources.samePrompt],
          ["multi-line", copy.batch.sources.multiline],
          ["ai-split", copy.batch.sources.aiSplit],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`source-card ${source === value ? "active" : ""}`}
            onClick={() => setSource(value)}
            disabled={isRunning}
          >
            {label}
          </button>
        ))}
      </div>

      <label className="field">
        <span>{copy.batch.fields.batchTitle}</span>
        <input value={batchTitle} disabled={isRunning} onChange={(event) => setBatchTitle(event.target.value)} />
      </label>

      {source === "multi-line" ? (
        <label className="field">
          <span>{copy.batch.fields.multilinePrompts}</span>
          <textarea
            value={multilinePrompts}
            rows={8}
            disabled={isRunning}
            onChange={(event) => setMultilinePrompts(event.target.value)}
          />
        </label>
      ) : (
        <label className="field">
          <span>{copy.batch.fields.masterPrompt}</span>
          <textarea
            value={masterPrompt}
            rows={6}
            disabled={isRunning}
            onChange={(event) => setMasterPrompt(event.target.value)}
          />
        </label>
      )}

      <div className="field-grid">
        <label className="field">
          <span>{copy.batch.fields.taskCount}</span>
          <input
            type="number"
            min={1}
            max={100}
            value={taskCount}
            disabled={isRunning}
            onChange={(event) => setTaskCount(Number(event.target.value) || 1)}
          />
        </label>
        <label className="field">
          <span>{copy.batch.fields.concurrency}</span>
          <input
            type="number"
            min={1}
            max={3}
            value={config.batchDefaultConcurrency}
            disabled={isRunning}
            onChange={(event) => onConfigChange("batchDefaultConcurrency", Number(event.target.value) || 1)}
          />
        </label>
        <label className="field">
          <span>{copy.batch.fields.intervalSeconds}</span>
          <input
            type="number"
            min={0}
            max={300}
            value={config.batchDefaultIntervalSeconds}
            disabled={isRunning}
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
            disabled={isRunning}
            onChange={(event) => onConfigChange("batchDefaultMaxRetries", Number(event.target.value) || 0)}
          />
        </label>
      </div>

      <div className="action-row">
        <button type="button" className="secondary-button" onClick={handleCreateTasks} disabled={isRunning}>
          {copy.batch.actions.createTasks}
        </button>
        <button type="button" className="secondary-button" onClick={handleSplitWithAi} disabled={isSplitting || isRunning}>
          {isSplitting ? copy.actions.optimizeBusy : copy.batch.actions.splitWithAi}
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
          onClick={() => void handleStartBatch()}
          disabled={!runtime || tasks.length === 0 || isRunning}
        >
          {status === "paused" ? copy.batch.actions.continue : copy.batch.actions.start}
        </button>
        <button type="button" className="secondary-button" onClick={handlePauseBatch} disabled={!isRunning}>
          {copy.batch.actions.pause}
        </button>
        <button type="button" className="secondary-button" onClick={handleCancelBatch} disabled={!isRunning}>
          {copy.batch.actions.cancel}
        </button>
      </div>

      {tasks.length === 0 ? (
        <div className="empty-state">{copy.batch.emptyTasks}</div>
      ) : (
        <div className="batch-task-list">
          {tasks.map((task) => (
            <article key={task.id} className={`batch-task-card ${task.status}`}>
              <div className="batch-task-index">{String(task.index + 1).padStart(2, "0")}</div>
              <div className="batch-task-main">
                <label className="field">
                  <span>{copy.fields.customName}</span>
                  <input
                    value={task.title}
                    disabled={isRunning}
                    onChange={(event) => handleUpdateTask(task.id, { title: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>{copy.fields.prompt}</span>
                  <textarea
                    value={task.prompt}
                    rows={3}
                    disabled={isRunning}
                    onChange={(event) => handleUpdateTask(task.id, { prompt: event.target.value })}
                  />
                </label>
                <div className="batch-task-meta">
                  <span className={`status-pill ${task.status}`}>{copy.batch.status[task.status]}</span>
                  <span>
                    {task.attemptCount} / {executionConfig.maxRetries + 1}
                  </span>
                  {task.durationMs > 0 ? <span>{Math.round(task.durationMs / 1000)}s</span> : null}
                  {task.outputPath ? <span>{task.outputPath}</span> : null}
                </div>
                {task.errorMessage ? <p className="error-copy">{task.errorMessage}</p> : null}
                <div className="action-row batch-task-actions">
                  {task.previewUrl ? <img className="batch-task-thumb" src={task.previewUrl} alt={task.title} /> : null}
                  <button type="button" className="ghost-button" onClick={() => handleDeleteTask(task.id)} disabled={isRunning}>
                    {copy.actions.removeImage}
                  </button>
                  {task.status === "failed" ? (
                    <button type="button" className="ghost-button" onClick={() => void handleRetryTask(task)} disabled={isRunning}>
                      {copy.batch.actions.retryTask}
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
