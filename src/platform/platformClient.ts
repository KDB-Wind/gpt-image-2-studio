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

export type PlatformPaymentPackage = {
  amountCny: number;
  credits: number;
};

export type PlatformPayment = {
  id: string;
  userId: string;
  amountCny: number;
  credits: number;
  status: "pending" | "approved" | "rejected";
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlatformHealthProbeSchedule = {
  dayStartHourUtc: number;
  nightStartHourUtc: number;
  dayIntervalMinutes: number;
  nightIntervalMinutes: number;
};

export type PlatformAdminUser = PlatformUser & {
  balance: number;
};

export type PlatformAdminProviderApiKey = {
  id: string;
  providerModelId: string;
  label: string;
  enabled: boolean;
  state: "healthy" | "cooldown" | "disabled";
  cooldownUntil: string | null;
  maxInFlight: number;
  createdAt: string;
  updatedAt: string;
};

export type PlatformAdminProviderHealthEvent = {
  id: string;
  providerModelId: string;
  apiKeyId: string | null;
  status: "success" | "failure" | "skipped";
  latencyMs: number | null;
  imageBytes: number | null;
  message: string;
  createdAt: string;
};

export type PlatformAdminProviderModel = {
  id: string;
  providerId: string;
  baseUrl: string;
  imageModel: string;
  state: "closed" | "open" | "half_open" | "maintenance";
  cooldownMs: number;
  openedAt: string | null;
  openUntil: string | null;
  lastFailureReason: string | null;
  createdAt: string;
  updatedAt: string;
  apiKeys: PlatformAdminProviderApiKey[];
  healthEvents: PlatformAdminProviderHealthEvent[];
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

    getCredits(userId: string, sessionToken: string) {
      return request<PlatformCreditOverview>(`/api/credits/${encodeURIComponent(userId)}`, {
        headers: getSessionHeaders(sessionToken),
      });
    },

    listUserJobs(userId: string, sessionToken: string) {
      return request<{ jobs: PlatformGenerationJob[] }>(
        `/api/users/${encodeURIComponent(userId)}/generation-jobs`,
        { headers: getSessionHeaders(sessionToken) },
      ).then((response) => response.jobs);
    },

    getGenerationJob(jobId: string, sessionToken: string) {
      return request<{ job: PlatformGenerationJob; results: PlatformGenerationResult[] }>(
        `/api/generation-jobs/${encodeURIComponent(jobId)}`,
        { headers: getSessionHeaders(sessionToken) },
      );
    },

    createGenerationJob(input: { userId: string; sessionToken: string; prompt: string; imageModel: string }) {
      const { sessionToken, ...body } = input;
      return request<PlatformGenerationJob>("/api/generation-jobs", {
        method: "POST",
        headers: getJsonSessionHeaders(sessionToken),
        body: JSON.stringify(body),
      });
    },

    listPaymentPackages() {
      return request<{ packages: PlatformPaymentPackage[] }>("/api/payment-packages").then(
        (response) => response.packages,
      );
    },

    createPaymentRequest(input: { userId: string; sessionToken: string; amountCny: number; note: string | null }) {
      const { sessionToken, ...body } = input;
      return request<PlatformPayment>("/api/payments", {
        method: "POST",
        headers: getJsonSessionHeaders(sessionToken),
        body: JSON.stringify(body),
      });
    },

    listUserPayments(userId: string, sessionToken: string) {
      return request<{ payments: PlatformPayment[] }>(`/api/users/${encodeURIComponent(userId)}/payments`, {
        headers: getSessionHeaders(sessionToken),
      }).then((response) => response.payments);
    },

    listAdminPayments(adminToken: string) {
      return request<{ payments: PlatformPayment[] }>("/api/admin/payments", {
        headers: getAdminHeaders(adminToken),
      }).then((response) => response.payments);
    },

    approvePayment(input: { paymentId: string; adminUserId: string; adminToken: string }) {
      return request<PlatformPayment>(`/api/admin/payments/${encodeURIComponent(input.paymentId)}/approve`, {
        method: "POST",
        headers: getJsonAdminHeaders(input.adminToken),
        body: JSON.stringify({ adminUserId: input.adminUserId }),
      });
    },

    rejectPayment(input: { paymentId: string; adminUserId: string; adminToken: string; reason: string }) {
      return request<PlatformPayment>(`/api/admin/payments/${encodeURIComponent(input.paymentId)}/reject`, {
        method: "POST",
        headers: getJsonAdminHeaders(input.adminToken),
        body: JSON.stringify({ adminUserId: input.adminUserId, reason: input.reason }),
      });
    },

    getHealthProbeSchedule(adminToken: string) {
      return request<PlatformHealthProbeSchedule>("/api/admin/health/probe-schedule", {
        headers: getAdminHeaders(adminToken),
      });
    },

    updateHealthProbeSchedule(input: { adminToken: string; schedule: PlatformHealthProbeSchedule }) {
      return request<PlatformHealthProbeSchedule>("/api/admin/health/probe-schedule", {
        method: "PUT",
        headers: getJsonAdminHeaders(input.adminToken),
        body: JSON.stringify(input.schedule),
      });
    },

    listAdminUsers(adminToken: string) {
      return request<{ users: PlatformAdminUser[] }>("/api/admin/users", {
        headers: getAdminHeaders(adminToken),
      }).then((response) => response.users);
    },

    updateAdminUser(input: {
      userId: string;
      adminUserId: string;
      adminToken: string;
      disabled: boolean;
    }) {
      return request<PlatformUser>(`/api/admin/users/${encodeURIComponent(input.userId)}`, {
        method: "PATCH",
        headers: getJsonAdminHeaders(input.adminToken),
        body: JSON.stringify({ adminUserId: input.adminUserId, disabled: input.disabled }),
      });
    },

    addAdminCredits(input: {
      userId: string;
      adminUserId: string;
      adminToken: string;
      amount: number;
      reason: string;
    }) {
      return request<PlatformCreditOverview>(`/api/admin/users/${encodeURIComponent(input.userId)}/credits`, {
        method: "POST",
        headers: getJsonAdminHeaders(input.adminToken),
        body: JSON.stringify({
          adminUserId: input.adminUserId,
          amount: input.amount,
          reason: input.reason,
        }),
      });
    },

    listAdminProviderModels(adminToken: string) {
      return request<{ models: PlatformAdminProviderModel[] }>("/api/admin/provider-models", {
        headers: getAdminHeaders(adminToken),
      }).then((response) => response.models);
    },

    updateAdminProviderApiKey(input: {
      apiKeyId: string;
      adminUserId: string;
      adminToken: string;
      enabled?: boolean;
      state?: PlatformAdminProviderApiKey["state"];
      maxInFlight?: number;
    }) {
      const { apiKeyId, adminToken, ...body } = input;
      return request<PlatformAdminProviderApiKey>(`/api/admin/provider-api-keys/${encodeURIComponent(apiKeyId)}`, {
        method: "PATCH",
        headers: getJsonAdminHeaders(adminToken),
        body: JSON.stringify(body),
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

function getAdminHeaders(adminToken: string) {
  return { "x-admin-token": adminToken };
}

function getJsonAdminHeaders(adminToken: string) {
  return { "content-type": "application/json", "x-admin-token": adminToken };
}

function getSessionHeaders(sessionToken: string) {
  return { authorization: `Bearer ${sessionToken}` };
}

function getJsonSessionHeaders(sessionToken: string) {
  return { "content-type": "application/json", authorization: `Bearer ${sessionToken}` };
}
