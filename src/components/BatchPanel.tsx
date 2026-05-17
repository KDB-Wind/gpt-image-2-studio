import { useMemo, useState } from "react";

import { createTasksFromMultilinePrompts, createTasksFromRepeatedPrompt, createTasksFromSplitResults } from "../core/batchPlanner";
import type { BatchSource, BatchStatus, BatchTask } from "../core/batchTypes";
import type { AppConfig } from "../core/config";
import { splitPromptWithTextModel } from "../core/batchPromptSplitter";
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
  onConfigChange,
  requireValidConfig,
  setAppMessage,
}: BatchPanelProps) {
  const copy = getTranslations(language);
  const [source, setSource] = useState<BatchSource>("same-prompt");
  const [status, setStatus] = useState<BatchStatus>("draft");
  const [batchTitle, setBatchTitle] = useState("");
  const [masterPrompt, setMasterPrompt] = useState("");
  const [multilinePrompts, setMultilinePrompts] = useState("");
  const [taskCount, setTaskCount] = useState(10);
  const [tasks, setTasks] = useState<BatchTask[]>([]);
  const [isSplitting, setIsSplitting] = useState(false);

  const summary = useMemo(
    () => ({
      total: tasks.length,
      succeeded: tasks.filter((task) => task.status === "succeeded").length,
      failed: tasks.filter((task) => task.status === "failed").length,
      skipped: tasks.filter((task) => task.status === "skipped").length,
    }),
    [tasks],
  );

  function handleCreateTasks() {
    const nextTasks =
      source === "multi-line"
        ? createTasksFromMultilinePrompts(multilinePrompts)
        : createTasksFromRepeatedPrompt(masterPrompt, taskCount);

    if (nextTasks.length === 0) {
      setAppMessage(copy.batch.messages.promptRequired);
      return;
    }

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
          >
            {label}
          </button>
        ))}
      </div>

      <label className="field">
        <span>{copy.batch.fields.batchTitle}</span>
        <input value={batchTitle} onChange={(event) => setBatchTitle(event.target.value)} />
      </label>

      {source === "multi-line" ? (
        <label className="field">
          <span>{copy.batch.fields.multilinePrompts}</span>
          <textarea
            value={multilinePrompts}
            rows={8}
            onChange={(event) => setMultilinePrompts(event.target.value)}
          />
        </label>
      ) : (
        <label className="field">
          <span>{copy.batch.fields.masterPrompt}</span>
          <textarea value={masterPrompt} rows={6} onChange={(event) => setMasterPrompt(event.target.value)} />
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
            onChange={(event) => onConfigChange("batchDefaultMaxRetries", Number(event.target.value) || 0)}
          />
        </label>
      </div>

      <div className="action-row">
        <button type="button" className="secondary-button" onClick={handleCreateTasks}>
          {copy.batch.actions.createTasks}
        </button>
        <button type="button" className="secondary-button" onClick={handleSplitWithAi} disabled={isSplitting || !runtime}>
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
      </div>
    </div>
  );
}
