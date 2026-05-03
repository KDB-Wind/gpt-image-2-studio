export type PlatformUser = {
  id: string;
  email: string;
  disabled: boolean;
  createdAt: string;
};

export type PlatformSession = {
  user: PlatformUser;
  sessionToken: string;
};

export type PlatformStatus = {
  providerState: "closed" | "open" | "half_open";
  openUntilMs: number | null;
  imageModel: string;
};

export type PlatformPromptTemplate = {
  id: string;
  category: string;
  title: string;
  description: string;
  prompt: string;
  variables: Array<{
    key: string;
    label: string;
    placeholder: string;
    required: boolean;
  }>;
  enabled: boolean;
};

export type PlatformCreditOverview = {
  balance: number;
  ledger: Array<{
    id: string;
    eventType: string;
    amount: number;
    reason: string;
    createdAt: string;
  }>;
};

export type PlatformGenerationJob = {
  id: string;
  userId: string;
  mode: "hosted" | "bring_your_own_key";
  prompt: string;
  imageModel: string;
  status: "queued" | "running" | "succeeded" | "failed" | "provider_circuit_open";
  errorCategory: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlatformGenerationResult = {
  id: string;
  jobId: string;
  storagePath: string;
  mimeType: string;
  bytes: number;
  width: number | null;
  height: number | null;
  createdAt: string;
};

export type CreatePlatformClientOptions = {
  baseUrl?: string;
  fetch?: typeof fetch;
};

export function createPlatformClient(options: CreatePlatformClientOptions = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? "");
  const fetchImpl = options.fetch ?? globalThis.fetch;

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetchImpl(`${baseUrl}${path}`, init);
    const payload = await readJson(response);

    if (!response.ok) {
      throw new Error(getApiErrorMessage(payload, response.status));
    }

    return payload as T;
  }

  return {
    requestEmailCode(email: string) {
      return request<{ id: string; email: string; expiresAt: string }>("/api/auth/request-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
    },

    verifyEmailCode(email: string, code: string) {
      return request<PlatformSession>("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
    },

    getStatus() {
      return request<PlatformStatus>("/api/status");
    },

    listPromptTemplates(category?: string) {
      const query = category ? `?category=${encodeURIComponent(category)}` : "";
      return request<{ templates: PlatformPromptTemplate[] }>(`/api/prompt-templates${query}`).then(
        (response) => response.templates,
      );
    },

    getCredits(userId: string) {
      return request<PlatformCreditOverview>(`/api/credits/${encodeURIComponent(userId)}`);
    },

    listUserJobs(userId: string) {
      return request<{ jobs: PlatformGenerationJob[] }>(
        `/api/users/${encodeURIComponent(userId)}/generation-jobs`,
      ).then((response) => response.jobs);
    },

    getGenerationJob(jobId: string) {
      return request<{ job: PlatformGenerationJob; results: PlatformGenerationResult[] }>(
        `/api/generation-jobs/${encodeURIComponent(jobId)}`,
      );
    },

    createGenerationJob(input: { userId: string; prompt: string; imageModel: string }) {
      return request<PlatformGenerationJob>("/api/generation-jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
    },
  };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function getApiErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === "string" && error.trim()) {
      return error;
    }
  }

  return `Platform request failed with status ${status}.`;
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}
