import { useEffect, useMemo, useState } from "react";

import {
  generateImages,
  optimizePrompt,
  testImageModel,
  testTextModel,
} from "./core/apiClient";
import { DEFAULT_CONFIG, type AppConfig, validateConfig } from "./core/config";
import { groupHistoryByDate, type ImageRecord } from "./core/history";
import { getRuntimeAdapter } from "./runtime";
import type { RuntimeAdapter } from "./runtime/types";

type AppTab = "generate" | "history" | "settings";

type SettingsMessage = {
  tone: "neutral" | "success" | "error";
  text: string;
};

type PreviewState =
  | { status: "idle" }
  | { status: "running"; startedAt: number; prompt: string }
  | {
      status: "success";
      prompt: string;
      optimizedPrompt: string;
      imageUrl: string;
      record: ImageRecord;
      customName: string;
    }
  | {
      status: "failed";
      prompt: string;
      message: string;
      durationMs: number;
    };

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatMode(mode: RuntimeAdapter["mode"] | null): string {
  if (mode === "desktop") {
    return "Desktop runtime";
  }

  if (mode === "web") {
    return "Web runtime";
  }

  return "Loading runtime";
}

export default function App() {
  const [runtime, setRuntime] = useState<RuntimeAdapter | null>(null);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [history, setHistory] = useState<ImageRecord[]>([]);
  const [activeTab, setActiveTab] = useState<AppTab>("generate");
  const [prompt, setPrompt] = useState("");
  const [optimizedPrompt, setOptimizedPrompt] = useState("");
  const [customName, setCustomName] = useState("");
  const [previewState, setPreviewState] = useState<PreviewState>({ status: "idle" });
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [appMessage, setAppMessage] = useState("");
  const [settingsMessage, setSettingsMessage] = useState<SettingsMessage>({
    tone: "neutral",
    text: "Load your runtime settings, then test connectivity or start generating.",
  });
  const [isLoadingApp, setIsLoadingApp] = useState(true);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isTestingText, setIsTestingText] = useState(false);
  const [isTestingImage, setIsTestingImage] = useState(false);

  const validation = useMemo(() => validateConfig(config), [config]);
  const historyGroups = useMemo(() => groupHistoryByDate(history), [history]);
  const effectivePrompt = optimizedPrompt.trim() || prompt.trim();
  const selectedRecord = useMemo(
    () => history.find((record) => record.id === selectedHistoryId) ?? null,
    [history, selectedHistoryId],
  );

  useEffect(() => {
    let isMounted = true;

    async function loadApp() {
      try {
        const adapter = await getRuntimeAdapter();
        const [loadedConfig, loadedHistory] = await Promise.all([
          adapter.loadConfig(),
          adapter.loadHistory(),
        ]);

        if (!isMounted) {
          return;
        }

        setRuntime(adapter);
        setConfig({ ...DEFAULT_CONFIG, ...loadedConfig });
        setHistory(loadedHistory);
        setSelectedHistoryId(loadedHistory[0]?.id ?? null);
        setSettingsMessage({
          tone: "neutral",
          text: `${formatMode(adapter.mode)} loaded. Save after changing settings.`,
        });
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setAppMessage(`Failed to load runtime state. ${getErrorMessage(error)}`);
      } finally {
        if (isMounted) {
          setIsLoadingApp(false);
        }
      }
    }

    void loadApp();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (previewState.status !== "running") {
      setElapsedMs(0);
      return;
    }

    setElapsedMs(Date.now() - previewState.startedAt);
    const intervalId = window.setInterval(() => {
      setElapsedMs(Date.now() - previewState.startedAt);
    }, 250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [previewState]);

  async function reloadHistory(adapter: RuntimeAdapter) {
    const loadedHistory = await adapter.loadHistory();
    setHistory(loadedHistory);
    return loadedHistory;
  }

  function updateConfig<K extends keyof AppConfig>(key: K, value: AppConfig[K]) {
    setConfig((current) => ({ ...current, [key]: value }));
  }

  async function handleOptimizePrompt() {
    const nextPrompt = prompt.trim();

    if (!nextPrompt) {
      setAppMessage("Enter a prompt before optimizing it.");
      return;
    }

    setIsOptimizing(true);
    setAppMessage("");

    try {
      const revisedPrompt = await optimizePrompt(config, nextPrompt);
      setOptimizedPrompt(revisedPrompt.trim());
    } catch (error) {
      setAppMessage(`Prompt optimization failed. ${getErrorMessage(error)}`);
    } finally {
      setIsOptimizing(false);
    }
  }

  async function handleGenerate() {
    if (!runtime) {
      return;
    }

    const sourcePrompt = prompt.trim();
    const finalPrompt = optimizedPrompt.trim() || sourcePrompt;

    if (!sourcePrompt) {
      setAppMessage("Enter a prompt before generating an image.");
      return;
    }

    const nextValidation = validateConfig(config);
    if (nextValidation.errors.length > 0) {
      setActiveTab("settings");
      setAppMessage(nextValidation.errors.join(" "));
      setPreviewState({
        status: "failed",
        prompt: finalPrompt,
        message: nextValidation.errors.join(" "),
        durationMs: 0,
      });
      return;
    }

    setIsGenerating(true);
    setAppMessage("");
    const startedAt = Date.now();
    setPreviewState({ status: "running", startedAt, prompt: finalPrompt });

    try {
      const generatedImages = await generateImages(config, finalPrompt);
      const firstImage = generatedImages[0];

      if (!firstImage) {
        throw new Error("Image generation returned no images.");
      }

      const generatedAt = new Date();
      const durationMs = Date.now() - startedAt;
      const savedResult = await runtime.saveImage({
        image: firstImage,
        prompt: sourcePrompt,
        optimizedPrompt: optimizedPrompt.trim(),
        customName: customName.trim(),
        config,
        generatedAt,
        durationMs,
      });

      await reloadHistory(runtime);
      setSelectedHistoryId(savedResult.record.id);
      setPreviewState({
        status: "success",
        prompt: sourcePrompt,
        optimizedPrompt: optimizedPrompt.trim(),
        imageUrl: savedResult.previewUrl,
        record: savedResult.record,
        customName: customName.trim(),
      });
    } catch (error) {
      setPreviewState({
        status: "failed",
        prompt: finalPrompt,
        message: getErrorMessage(error),
        durationMs: Date.now() - startedAt,
      });
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSaveSettings() {
    if (!runtime) {
      return;
    }

    setIsSavingSettings(true);

    try {
      await runtime.saveConfig(config);
      const tone = validation.errors.length > 0 ? "error" : "success";
      const details = [...validation.errors, ...validation.warnings].join(" ");

      setSettingsMessage({
        tone,
        text: details ? `Settings saved. ${details}` : "Settings saved.",
      });
    } catch (error) {
      setSettingsMessage({
        tone: "error",
        text: `Failed to save settings. ${getErrorMessage(error)}`,
      });
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function handleChooseDirectory() {
    if (!runtime) {
      return;
    }

    try {
      const selectedDirectory = await runtime.chooseOutputDirectory();

      if (selectedDirectory) {
        updateConfig("outputDirectory", selectedDirectory);
        setSettingsMessage({
          tone: "neutral",
          text: `Output directory selected: ${selectedDirectory}`,
        });
      }
    } catch (error) {
      setSettingsMessage({
        tone: "error",
        text: `Failed to choose a directory. ${getErrorMessage(error)}`,
      });
    }
  }

  async function handleTestTextModel() {
    setIsTestingText(true);

    try {
      const response = await testTextModel(config);
      setSettingsMessage({
        tone: "success",
        text: `Text model responded: ${response.trim().slice(0, 120) || "OK"}`,
      });
    } catch (error) {
      setSettingsMessage({
        tone: "error",
        text: `Text model test failed. ${getErrorMessage(error)}`,
      });
    } finally {
      setIsTestingText(false);
    }
  }

  async function handleTestImageModel() {
    setIsTestingImage(true);

    try {
      const images = await testImageModel(config);
      setSettingsMessage({
        tone: "success",
        text: `Image model responded with ${images.length} image${images.length === 1 ? "" : "s"}.`,
      });
    } catch (error) {
      setSettingsMessage({
        tone: "error",
        text: `Image model test failed. ${getErrorMessage(error)}`,
      });
    } finally {
      setIsTestingImage(false);
    }
  }

  function handleReusePrompt(record: ImageRecord) {
    setPrompt(record.prompt);
    setOptimizedPrompt(record.optimizedPrompt);
    setCustomName("");
    setSelectedHistoryId(record.id);
    setActiveTab("generate");
  }

  async function handleOpenOutput(record: ImageRecord) {
    if (!runtime) {
      return;
    }

    try {
      await runtime.openOutputPath(record.outputPath);
    } catch (error) {
      setAppMessage(`Could not open output path. ${getErrorMessage(error)}`);
    }
  }

  return (
    <main className={`app-shell ${activeTab === "history" ? "history-focus" : ""}`}>
      <header className="app-header">
        <div>
          <p className="eyebrow">Application Workspace</p>
          <h1>Chat To Image</h1>
          <p className="app-subtitle">
            Compose a prompt, refine it, generate an image, and keep a dated local history.
          </p>
        </div>
        <div className="mode-chip" aria-live="polite">
          <span className={`mode-dot ${runtime?.mode ?? "loading"}`} />
          {formatMode(runtime?.mode ?? null)}
        </div>
      </header>

      {appMessage ? (
        <div className="app-banner" role="status">
          {appMessage}
        </div>
      ) : null}

      <div className="tab-strip" role="tablist" aria-label="Workspace tabs">
        {(["generate", "history", "settings"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={`tab-button ${activeTab === tab ? "active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <section className="workspace-grid">
        <section className="panel control-panel">
          <header className="panel-header">
            <div>
              <h2>
                {activeTab === "generate" && "Generate"}
                {activeTab === "history" && "History tools"}
                {activeTab === "settings" && "Settings"}
              </h2>
              <p>
                {activeTab === "generate" && "Create and refine the prompt you want to send."}
                {activeTab === "history" && "Reuse prompts from prior runs and inspect outputs."}
                {activeTab === "settings" && "Configure the runtime and verify both model endpoints."}
              </p>
            </div>
          </header>

          {activeTab === "generate" ? (
            <div className="panel-body form-stack">
              <label className="field">
                <span>Prompt</span>
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  rows={8}
                  placeholder="Describe the image you want to generate."
                />
              </label>

              <div className="field-grid">
                <label className="field">
                  <span>Custom image name</span>
                  <input
                    value={customName}
                    onChange={(event) => setCustomName(event.target.value)}
                    placeholder="optional file name"
                  />
                </label>

                <div className="field field-readonly">
                  <span>Effective prompt</span>
                  <div className="readonly-value">{effectivePrompt || "Uses your prompt when empty."}</div>
                </div>
              </div>

              <label className="field">
                <span>Optimized prompt</span>
                <textarea
                  value={optimizedPrompt}
                  onChange={(event) => setOptimizedPrompt(event.target.value)}
                  rows={6}
                  placeholder="Optional optimized prompt override."
                />
              </label>

              <div className="action-row">
                <button type="button" className="secondary-button" onClick={handleOptimizePrompt} disabled={isOptimizing || isGenerating || isLoadingApp}>
                  {isOptimizing ? "Optimizing..." : "Optimize prompt"}
                </button>
                <button type="button" className="secondary-button" onClick={() => setOptimizedPrompt("")} disabled={!optimizedPrompt || isGenerating}>
                  Clear optimized
                </button>
                <button type="button" className="primary-button" onClick={handleGenerate} disabled={isGenerating || isLoadingApp || !runtime}>
                  {isGenerating ? "Generating..." : "Generate image"}
                </button>
              </div>

              <div className="info-card">
                <h3>Current output</h3>
                <dl>
                  <div>
                    <dt>Image model</dt>
                    <dd>{config.imageModel}</dd>
                  </div>
                  <div>
                    <dt>Output directory</dt>
                    <dd>{config.outputDirectory || "outputs"}</dd>
                  </div>
                  <div>
                    <dt>Timeout</dt>
                    <dd>{config.timeoutSeconds}s</dd>
                  </div>
                </dl>
                {validation.warnings.length > 0 ? (
                  <p className="panel-note">{validation.warnings.join(" ")}</p>
                ) : null}
              </div>
            </div>
          ) : null}

          {activeTab === "history" ? (
            <div className="panel-body form-stack">
              <div className="stats-grid">
                <div className="stat-card">
                  <span>Total records</span>
                  <strong>{history.length}</strong>
                </div>
                <div className="stat-card">
                  <span>Date groups</span>
                  <strong>{historyGroups.length}</strong>
                </div>
              </div>

              <div className="info-card">
                <h3>Selected run</h3>
                {selectedRecord ? (
                  <>
                    <p>{selectedRecord.prompt}</p>
                    <dl>
                      <div>
                        <dt>Created</dt>
                        <dd>{formatDateTime(selectedRecord.createdAt)}</dd>
                      </div>
                      <div>
                        <dt>Duration</dt>
                        <dd>{formatDuration(selectedRecord.durationMs)}</dd>
                      </div>
                      <div>
                        <dt>Output</dt>
                        <dd>{selectedRecord.outputPath}</dd>
                      </div>
                    </dl>
                    <div className="action-row">
                      <button type="button" className="secondary-button" onClick={() => handleReusePrompt(selectedRecord)}>
                        Reuse prompt
                      </button>
                      <button type="button" className="secondary-button" onClick={() => void handleOpenOutput(selectedRecord)}>
                        Open output
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="empty-state">No history selected yet.</p>
                )}
              </div>
            </div>
          ) : null}

          {activeTab === "settings" ? (
            <div className="panel-body form-stack">
              <div className="field-grid">
                <label className="field">
                  <span>Base URL</span>
                  <input
                    value={config.baseUrl}
                    onChange={(event) => updateConfig("baseUrl", event.target.value)}
                    placeholder="https://example.com/v1"
                  />
                </label>

                <label className="field">
                  <span>API key</span>
                  <input
                    value={config.apiKey}
                    onChange={(event) => updateConfig("apiKey", event.target.value)}
                    placeholder="sk-..."
                    type="password"
                  />
                </label>
              </div>

              <div className="field-grid">
                <label className="field">
                  <span>Text model</span>
                  <input
                    value={config.textModel}
                    onChange={(event) => updateConfig("textModel", event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Image model</span>
                  <input
                    value={config.imageModel}
                    onChange={(event) => updateConfig("imageModel", event.target.value)}
                  />
                </label>
              </div>

              <div className="field-grid">
                <label className="field">
                  <span>Timeout (seconds)</span>
                  <input
                    type="number"
                    min={180}
                    step={1}
                    value={config.timeoutSeconds}
                    onChange={(event) => updateConfig("timeoutSeconds", Number(event.target.value) || 0)}
                  />
                </label>

                <label className="field">
                  <span>Output directory</span>
                  <input
                    value={config.outputDirectory}
                    onChange={(event) => updateConfig("outputDirectory", event.target.value)}
                  />
                </label>
              </div>

              <div className="action-row">
                <button type="button" className="secondary-button" onClick={handleChooseDirectory} disabled={!runtime}>
                  Choose directory
                </button>
                <button type="button" className="secondary-button" onClick={handleTestTextModel} disabled={isTestingText}>
                  {isTestingText ? "Testing text..." : "Test text"}
                </button>
                <button type="button" className="secondary-button" onClick={handleTestImageModel} disabled={isTestingImage}>
                  {isTestingImage ? "Testing image..." : "Test image"}
                </button>
                <button type="button" className="primary-button" onClick={handleSaveSettings} disabled={isSavingSettings || !runtime}>
                  {isSavingSettings ? "Saving..." : "Save"}
                </button>
              </div>

              <div className={`message-card ${settingsMessage.tone}`}>
                {settingsMessage.text}
              </div>

              {validation.errors.length > 0 ? (
                <div className="validation-list error">
                  <h3>Validation errors</h3>
                  <ul>
                    {validation.errors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {validation.warnings.length > 0 ? (
                <div className="validation-list warning">
                  <h3>Warnings</h3>
                  <ul>
                    {validation.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="panel preview-panel">
          <header className="panel-header">
            <div>
              <h2>Preview</h2>
              <p>
                {previewState.status === "running" ? "Generation in progress." : "Latest workflow state."}
              </p>
            </div>
            {previewState.status === "running" ? (
              <div className="timer-pill">{formatDuration(elapsedMs)}</div>
            ) : null}
          </header>

          <div className="panel-body preview-body">
            {isLoadingApp ? <p className="empty-state">Loading runtime state...</p> : null}

            {!isLoadingApp && previewState.status === "idle" ? (
              <div className="preview-state">
                <div className="preview-placeholder">Idle</div>
                <p>Run prompt optimization or generate an image to populate this pane.</p>
                {selectedRecord ? (
                  <div className="info-card preview-details">
                    <h3>Last selected history item</h3>
                    <p>{selectedRecord.prompt}</p>
                    <dl>
                      <div>
                        <dt>Created</dt>
                        <dd>{formatDateTime(selectedRecord.createdAt)}</dd>
                      </div>
                      <div>
                        <dt>Status</dt>
                        <dd>{selectedRecord.status}</dd>
                      </div>
                    </dl>
                  </div>
                ) : null}
              </div>
            ) : null}

            {previewState.status === "running" ? (
              <div className="preview-state">
                <div className="preview-placeholder running">Running</div>
                <p>{previewState.prompt}</p>
                <p className="panel-note">Saving happens after generation completes successfully.</p>
              </div>
            ) : null}

            {previewState.status === "failed" ? (
              <div className="preview-state">
                <div className="preview-placeholder failed">Failed</div>
                <p>{previewState.prompt}</p>
                <p className="error-copy">{previewState.message}</p>
                <p className="panel-note">Elapsed: {formatDuration(previewState.durationMs)}</p>
              </div>
            ) : null}

            {previewState.status === "success" ? (
              <div className="preview-success">
                <div className="preview-frame">
                  <img src={previewState.imageUrl} alt={previewState.prompt} />
                </div>
                <div className="info-card preview-details">
                  <h3>Saved image</h3>
                  <dl>
                    <div>
                      <dt>Created</dt>
                      <dd>{formatDateTime(previewState.record.createdAt)}</dd>
                    </div>
                    <div>
                      <dt>Duration</dt>
                      <dd>{formatDuration(previewState.record.durationMs)}</dd>
                    </div>
                    <div>
                      <dt>Output path</dt>
                      <dd>{previewState.record.outputPath}</dd>
                    </div>
                    <div>
                      <dt>Custom name</dt>
                      <dd>{previewState.customName || "Auto-generated"}</dd>
                    </div>
                  </dl>
                  <p>{previewState.optimizedPrompt || previewState.prompt}</p>
                  <div className="action-row">
                    <button type="button" className="secondary-button" onClick={() => handleReusePrompt(previewState.record)}>
                      Reuse prompt
                    </button>
                    <button type="button" className="secondary-button" onClick={() => void handleOpenOutput(previewState.record)}>
                      Open output
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="panel history-panel">
          <header className="panel-header">
            <div>
              <h2>History</h2>
              <p>Grouped by output date with prompt reuse actions.</p>
            </div>
            <div className="history-count">{history.length}</div>
          </header>

          <div className="panel-body history-body">
            {historyGroups.length === 0 ? (
              <p className="empty-state">No images have been saved yet.</p>
            ) : (
              historyGroups.map((group) => (
                <section key={group.date} className="history-group">
                  <div className="history-group-header">
                    <h3>{group.date}</h3>
                    <span>{group.records.length}</span>
                  </div>

                  <div className="history-list">
                    {group.records.map((record) => (
                      <article
                        key={record.id}
                        className={`history-item ${record.id === selectedHistoryId ? "selected" : ""}`}
                      >
                        <div className="history-item-head">
                          <span className={`status-pill ${record.status}`}>{record.status}</span>
                          <time dateTime={record.createdAt}>{formatDateTime(record.createdAt)}</time>
                        </div>
                        <p className="history-prompt">{record.optimizedPrompt || record.prompt}</p>
                        <dl className="history-meta">
                          <div>
                            <dt>Model</dt>
                            <dd>{record.model}</dd>
                          </div>
                          <div>
                            <dt>Duration</dt>
                            <dd>{formatDuration(record.durationMs)}</dd>
                          </div>
                        </dl>
                        <div className="history-actions">
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => setSelectedHistoryId(record.id)}
                          >
                            Inspect
                          </button>
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => handleReusePrompt(record)}
                          >
                            Reuse prompt
                          </button>
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => void handleOpenOutput(record)}
                          >
                            Open output
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
