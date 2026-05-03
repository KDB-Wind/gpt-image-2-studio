import { useEffect, useMemo, useState } from "react";

import {
  createPlatformClient,
  type PlatformCreditOverview,
  type PlatformGenerationJob,
  type PlatformGenerationResult,
  type PlatformPromptTemplate,
  type PlatformSession,
  type PlatformStatus,
} from "./platformClient";
import { getCategoryLabel, getTemplateCategories, renderTemplatePrompt } from "./promptTools";

type PlatformAppProps = {
  onOpenBasicTool: () => void;
};

type Message = {
  tone: "neutral" | "success" | "error";
  text: string;
};

const SESSION_STORAGE_KEY = "chat-to-image.platform.session";
const API_BASE_STORAGE_KEY = "chat-to-image.platform.apiBase";
const DEFAULT_IMAGE_MODEL = "gpt-image-2";

export function PlatformApp({ onOpenBasicTool }: PlatformAppProps) {
  const [apiBaseUrl, setApiBaseUrl] = useState(getInitialApiBaseUrl);
  const [session, setSession] = useState<PlatformSession | null>(loadStoredSession);
  const [email, setEmail] = useState(session?.user.email ?? "");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<PlatformStatus | null>(null);
  const [credits, setCredits] = useState<PlatformCreditOverview | null>(null);
  const [templates, setTemplates] = useState<PlatformPromptTemplate[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateValues, setTemplateValues] = useState<Record<string, string>>({});
  const [prompt, setPrompt] = useState("");
  const [jobs, setJobs] = useState<PlatformGenerationJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedResults, setSelectedResults] = useState<PlatformGenerationResult[]>([]);
  const [message, setMessage] = useState<Message>({
    tone: "neutral",
    text: "平台版会把生图任务提交到后端队列；自有 API key 模式请切换到基础工具版。",
  });
  const [isRequestingCode, setIsRequestingCode] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false);
  const [isSubmittingJob, setIsSubmittingJob] = useState(false);

  const client = useMemo(() => createPlatformClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const categories = useMemo(() => getTemplateCategories(templates), [templates]);
  const filteredTemplates = useMemo(
    () => templates.filter((template) => selectedCategory === "all" || template.category === selectedCategory),
    [selectedCategory, templates],
  );
  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates],
  );
  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) ?? null,
    [jobs, selectedJobId],
  );

  useEffect(() => {
    window.localStorage.setItem(API_BASE_STORAGE_KEY, apiBaseUrl);
  }, [apiBaseUrl]);

  useEffect(() => {
    void loadPublicDashboard();
  }, [client]);

  useEffect(() => {
    if (session) {
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      void loadUserDashboard(session.user.id);
      return;
    }

    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    setCredits(null);
    setJobs([]);
    setSelectedJobId(null);
    setSelectedResults([]);
  }, [client, session]);

  useEffect(() => {
    if (!selectedTemplate && templates[0]) {
      setSelectedTemplateId(templates[0].id);
    }
  }, [selectedTemplate, templates]);

  async function loadPublicDashboard() {
    setIsLoadingDashboard(true);
    try {
      const [nextStatus, nextTemplates] = await Promise.all([
        client.getStatus(),
        client.listPromptTemplates(),
      ]);
      setStatus(nextStatus);
      setTemplates(nextTemplates);
    } catch (error) {
      setMessage({ tone: "error", text: getErrorMessage(error) });
    } finally {
      setIsLoadingDashboard(false);
    }
  }

  async function loadUserDashboard(userId = session?.user.id) {
    if (!userId) {
      return;
    }

    setIsLoadingDashboard(true);
    try {
      const [nextCredits, nextJobs] = await Promise.all([
        client.getCredits(userId),
        client.listUserJobs(userId),
      ]);
      setCredits(nextCredits);
      setJobs(nextJobs);
      setSelectedJobId((current) => current ?? nextJobs[0]?.id ?? null);
    } catch (error) {
      setMessage({ tone: "error", text: getErrorMessage(error) });
    } finally {
      setIsLoadingDashboard(false);
    }
  }

  async function requestCode() {
    if (!email.trim()) {
      setMessage({ tone: "error", text: "请输入邮箱。" });
      return;
    }

    setIsRequestingCode(true);
    try {
      await client.requestEmailCode(email.trim());
      setMessage({ tone: "success", text: "验证码已发送。开发环境下验证码会输出在 API 服务控制台。" });
    } catch (error) {
      setMessage({ tone: "error", text: getErrorMessage(error) });
    } finally {
      setIsRequestingCode(false);
    }
  }

  async function verifyCode() {
    if (!email.trim() || !code.trim()) {
      setMessage({ tone: "error", text: "请输入邮箱和验证码。" });
      return;
    }

    setIsVerifying(true);
    try {
      const nextSession = await client.verifyEmailCode(email.trim(), code.trim());
      setSession(nextSession);
      setCode("");
      setMessage({ tone: "success", text: `已登录：${nextSession.user.email}` });
    } catch (error) {
      setMessage({ tone: "error", text: getErrorMessage(error) });
    } finally {
      setIsVerifying(false);
    }
  }

  function applyTemplate() {
    if (!selectedTemplate) {
      return;
    }

    try {
      setPrompt(renderTemplatePrompt(selectedTemplate, templateValues));
      setMessage({ tone: "success", text: `已套用模板：${selectedTemplate.title}` });
    } catch (error) {
      setMessage({ tone: "error", text: getErrorMessage(error) });
    }
  }

  async function submitHostedJob() {
    if (!session) {
      setMessage({ tone: "error", text: "请先登录后再使用平台托管模式。" });
      return;
    }

    const finalPrompt = prompt.trim();
    if (!finalPrompt) {
      setMessage({ tone: "error", text: "请输入提示词，或先套用一个模板。" });
      return;
    }

    setIsSubmittingJob(true);
    try {
      const job = await client.createGenerationJob({
        userId: session.user.id,
        prompt: finalPrompt,
        imageModel: status?.imageModel || DEFAULT_IMAGE_MODEL,
      });
      setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
      setSelectedJobId(job.id);
      setSelectedResults([]);
      await loadUserDashboard(session.user.id);
      setMessage({ tone: "success", text: "任务已提交到平台队列。" });
    } catch (error) {
      setMessage({ tone: "error", text: getErrorMessage(error) });
    } finally {
      setIsSubmittingJob(false);
    }
  }

  async function inspectJob(jobId: string) {
    setSelectedJobId(jobId);
    try {
      const detail = await client.getGenerationJob(jobId);
      setSelectedResults(detail.results);
    } catch (error) {
      setMessage({ tone: "error", text: getErrorMessage(error) });
    }
  }

  function signOut() {
    setSession(null);
    setMessage({ tone: "neutral", text: "已退出平台账号。" });
  }

  return (
    <main className="platform-shell">
      <header className="platform-header">
        <div>
          <p className="platform-eyebrow">Web Platform MVP</p>
          <h1>Chat To Image 平台工作台</h1>
          <p>注册登录、选择提示词模板、查看额度，并把平台托管生图任务提交到后端队列。</p>
        </div>
        <div className="platform-header-actions">
          <button type="button" className="platform-secondary" onClick={onOpenBasicTool}>
            自有 API key 模式
          </button>
          <button type="button" className="platform-secondary" onClick={() => void loadPublicDashboard()}>
            刷新状态
          </button>
        </div>
      </header>

      <section className="platform-status-strip">
        <article>
          <span>生图服务</span>
          <strong className={status?.providerState === "closed" ? "is-ok" : "is-risk"}>
            {formatProviderState(status)}
          </strong>
        </article>
        <article>
          <span>图片模型</span>
          <strong>{status?.imageModel ?? DEFAULT_IMAGE_MODEL}</strong>
        </article>
        <article>
          <span>当前额度</span>
          <strong>{session ? credits?.balance ?? 0 : "未登录"}</strong>
        </article>
        <article>
          <span>任务数</span>
          <strong>{jobs.length}</strong>
        </article>
      </section>

      <section className="platform-layout">
        <section className="platform-panel account-panel">
          <header>
            <h2>账号</h2>
            <p>邮箱验证码登录。新用户登录成功后会在首次托管生图时获得每日免费额度。</p>
          </header>

          <label>
            <span>API 地址</span>
            <input value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} placeholder="留空表示同源 /api" />
          </label>

          {!session ? (
            <>
              <label>
                <span>邮箱</span>
                <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
              </label>
              <label>
                <span>验证码</span>
                <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="6 位验证码" />
              </label>
              <div className="platform-actions">
                <button type="button" className="platform-secondary" onClick={() => void requestCode()} disabled={isRequestingCode}>
                  {isRequestingCode ? "发送中" : "发送验证码"}
                </button>
                <button type="button" className="platform-primary" onClick={() => void verifyCode()} disabled={isVerifying}>
                  {isVerifying ? "登录中" : "登录"}
                </button>
              </div>
            </>
          ) : (
            <div className="account-card">
              <span>{session.user.email}</span>
              <strong>{session.user.id}</strong>
              <button type="button" className="platform-secondary" onClick={signOut}>
                退出登录
              </button>
            </div>
          )}

          <div className={`platform-message ${message.tone}`}>{message.text}</div>
        </section>

        <section className="platform-panel template-panel">
          <header>
            <h2>提示词模板</h2>
            <p>选择分类和模板，填写变量后生成可直接提交的提示词。</p>
          </header>

          <div className="category-row">
            <button
              type="button"
              className={selectedCategory === "all" ? "active" : ""}
              onClick={() => setSelectedCategory("all")}
            >
              全部
            </button>
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                className={selectedCategory === category ? "active" : ""}
                onClick={() => setSelectedCategory(category)}
              >
                {getCategoryLabel(category)}
              </button>
            ))}
          </div>

          <div className="template-grid">
            {filteredTemplates.map((template) => (
              <button
                key={template.id}
                type="button"
                className={selectedTemplateId === template.id ? "template-card selected" : "template-card"}
                onClick={() => {
                  setSelectedTemplateId(template.id);
                  setTemplateValues({});
                }}
              >
                <span>{getCategoryLabel(template.category)}</span>
                <strong>{template.title}</strong>
                <small>{template.description}</small>
              </button>
            ))}
          </div>

          {selectedTemplate ? (
            <div className="template-editor">
              <h3>{selectedTemplate.title}</h3>
              <div className="template-vars">
                {selectedTemplate.variables.map((variable) => (
                  <label key={variable.key}>
                    <span>{variable.label}</span>
                    <input
                      value={templateValues[variable.key] ?? ""}
                      onChange={(event) =>
                        setTemplateValues((current) => ({
                          ...current,
                          [variable.key]: event.target.value,
                        }))
                      }
                      placeholder={variable.placeholder}
                    />
                  </label>
                ))}
              </div>
              <button type="button" className="platform-secondary" onClick={applyTemplate}>
                套用模板
              </button>
            </div>
          ) : null}
        </section>

        <section className="platform-panel composer-panel">
          <header>
            <h2>托管生图</h2>
            <p>这里会提交到平台队列；Worker 成功生成后才扣额度。</p>
          </header>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={10}
            placeholder="选择模板，或直接输入你的生图提示词。"
          />
          <div className="platform-actions">
            <button type="button" className="platform-secondary" onClick={() => setPrompt("")}>
              清空
            </button>
            <button
              type="button"
              className="platform-primary"
              onClick={() => void submitHostedJob()}
              disabled={isSubmittingJob || isLoadingDashboard}
            >
              {isSubmittingJob ? "提交中" : "提交托管任务"}
            </button>
          </div>
        </section>

        <section className="platform-panel jobs-panel">
          <header>
            <h2>任务历史</h2>
            <p>查看队列状态、失败原因和已保存结果路径。</p>
          </header>

          <div className="platform-actions">
            <button type="button" className="platform-secondary" onClick={() => void loadUserDashboard()}>
              刷新任务
            </button>
          </div>

          <div className="job-list">
            {jobs.length === 0 ? (
              <p className="platform-empty">{session ? "暂无任务。" : "登录后显示你的任务历史。"}</p>
            ) : (
              jobs.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  className={selectedJobId === job.id ? "job-card selected" : "job-card"}
                  onClick={() => void inspectJob(job.id)}
                >
                  <span className={`job-status ${job.status}`}>{formatJobStatus(job.status)}</span>
                  <strong>{job.prompt}</strong>
                  <small>{formatDateTime(job.updatedAt)}</small>
                  {job.errorCategory ? <em>{job.errorCategory}</em> : null}
                </button>
              ))
            )}
          </div>

          {selectedJob ? (
            <div className="job-detail">
              <h3>{formatJobStatus(selectedJob.status)}</h3>
              <p>{selectedJob.prompt}</p>
              <dl>
                <div>
                  <dt>任务 ID</dt>
                  <dd>{selectedJob.id}</dd>
                </div>
                <div>
                  <dt>模型</dt>
                  <dd>{selectedJob.imageModel}</dd>
                </div>
                <div>
                  <dt>更新时间</dt>
                  <dd>{formatDateTime(selectedJob.updatedAt)}</dd>
                </div>
              </dl>
              {selectedResults.length > 0 ? (
                <div className="result-list">
                  {selectedResults.map((result) => (
                    <article key={result.id}>
                      <strong>{formatBytes(result.bytes)}</strong>
                      <span>{result.storagePath}</span>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="platform-empty">当前任务暂无可展示结果。</p>
              )}
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}

function loadStoredSession(): PlatformSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PlatformSession) : null;
  } catch {
    return null;
  }
}

function getInitialApiBaseUrl(): string {
  const stored = window.localStorage.getItem(API_BASE_STORAGE_KEY);
  if (stored !== null) {
    return stored;
  }

  return "";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "请求失败。";
}

function formatProviderState(status: PlatformStatus | null): string {
  if (!status) {
    return "未知";
  }

  if (status.providerState === "closed") {
    return "正常";
  }

  if (status.providerState === "open") {
    return "已熔断";
  }

  return "半开探测";
}

function formatJobStatus(status: PlatformGenerationJob["status"]): string {
  const labels: Record<PlatformGenerationJob["status"], string> = {
    queued: "排队中",
    running: "生成中",
    succeeded: "已完成",
    failed: "失败",
    provider_circuit_open: "供应商暂停",
  };

  return labels[status];
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatBytes(value: number): string {
  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`;
  }

  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
