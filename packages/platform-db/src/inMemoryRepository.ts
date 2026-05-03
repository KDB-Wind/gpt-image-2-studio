import type {
  AddCreditLedgerEventInput,
  AdminAuditLog,
  AppSetting,
  CreateEmailVerificationCodeInput,
  CreateGenerationJobInput,
  CreateGenerationResultInput,
  CreatePaymentInput,
  CreateProviderApiKeyInput,
  CreateSessionInput,
  CreateUserInput,
  CreditLedgerEvent,
  EmailVerificationCode,
  GenerationJob,
  GenerationResult,
  Payment,
  PlatformRepository,
  PromptTemplate,
  ProviderApiKey,
  ProviderModel,
  ProviderModelHealthEvent,
  RecordAdminAuditLogInput,
  RecordProviderHealthEventInput,
  Session,
  UpsertPromptTemplateInput,
  UpsertProviderModelInput,
  User,
} from "./repository";

export function createInMemoryPlatformRepository(): PlatformRepository {
  const users = new Map<string, User>();
  const verificationCodes = new Map<string, EmailVerificationCode>();
  const sessions = new Map<string, Session>();
  const balances = new Map<string, number>();
  const ledgerEvents = new Map<string, CreditLedgerEvent>();
  const jobs = new Map<string, GenerationJob>();
  const results = new Map<string, GenerationResult>();
  const templates = new Map<string, PromptTemplate>();
  const providerModels = new Map<string, ProviderModel>();
  const providerApiKeys = new Map<string, ProviderApiKey>();
  const healthEvents = new Map<string, ProviderModelHealthEvent>();
  const payments = new Map<string, Payment>();
  const auditLogs = new Map<string, AdminAuditLog>();
  const settings = new Map<string, AppSetting>();
  const sequences = new Map<string, number>();

  function nextId(prefix: string): string {
    const next = (sequences.get(prefix) ?? 0) + 1;
    sequences.set(prefix, next);
    return `${prefix}-${next}`;
  }

  return {
    async createUser(input: CreateUserInput) {
      const user: User = {
        id: nextId("user"),
        email: normalizeEmail(input.email),
        disabled: false,
        createdAt: new Date(),
      };
      users.set(user.id, user);
      balances.set(user.id, 0);
      return user;
    },

    async getUser(userId: string) {
      return users.get(userId) ?? null;
    },

    async getUserByEmail(email: string) {
      const normalized = normalizeEmail(email);
      return [...users.values()].find((user) => user.email === normalized) ?? null;
    },

    async setUserDisabled(userId: string, disabled: boolean) {
      const user = requireExisting(users, userId, "User");
      const next = { ...user, disabled };
      users.set(userId, next);
      return next;
    },

    async createEmailVerificationCode(input: CreateEmailVerificationCodeInput) {
      const code: EmailVerificationCode = {
        id: nextId("verification-code"),
        email: normalizeEmail(input.email),
        codeHash: input.codeHash,
        expiresAt: input.expiresAt,
        usedAt: null,
        attempts: 0,
        ipAddress: input.ipAddress ?? null,
        createdAt: new Date(),
      };
      verificationCodes.set(code.id, code);
      return code;
    },

    async getLatestEmailVerificationCode(email: string) {
      const normalized = normalizeEmail(email);
      return [...verificationCodes.values()]
        .filter((code) => code.email === normalized)
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null;
    },

    async markEmailVerificationCodeUsed(codeId: string, usedAt: Date) {
      const code = requireExisting(verificationCodes, codeId, "Email verification code");
      const next = { ...code, usedAt };
      verificationCodes.set(codeId, next);
      return next;
    },

    async incrementEmailVerificationCodeAttempts(codeId: string) {
      const code = requireExisting(verificationCodes, codeId, "Email verification code");
      const next = { ...code, attempts: code.attempts + 1 };
      verificationCodes.set(codeId, next);
      return next;
    },

    async createSession(input: CreateSessionInput) {
      const session: Session = {
        id: nextId("session"),
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        revokedAt: null,
        createdAt: new Date(),
      };
      sessions.set(session.id, session);
      return session;
    },

    async getSessionByTokenHash(tokenHash: string) {
      return [...sessions.values()].find((session) => session.tokenHash === tokenHash) ?? null;
    },

    async revokeSession(sessionId: string, revokedAt: Date) {
      const session = requireExisting(sessions, sessionId, "Session");
      const next = { ...session, revokedAt };
      sessions.set(sessionId, next);
      return next;
    },

    async upsertPromptTemplate(input: UpsertPromptTemplateInput) {
      const existing = templates.get(input.id);
      const now = new Date();
      const next: PromptTemplate = {
        ...input,
        sourceUrl: input.sourceUrl ?? null,
        license: input.license ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      templates.set(input.id, next);
      return next;
    },

    async listPromptTemplates() {
      return [...templates.values()].sort((left, right) => left.id.localeCompare(right.id));
    },

    async setPromptTemplateEnabled(templateId: string, enabled: boolean) {
      const template = requireExisting(templates, templateId, "Prompt template");
      const next = { ...template, enabled, updatedAt: new Date() };
      templates.set(templateId, next);
      return next;
    },

    async upsertProviderModel(input: UpsertProviderModelInput) {
      const id = input.id ?? findProviderModelId(providerModels, input.baseUrl, input.imageModel) ?? nextId("provider-model");
      const existing = providerModels.get(id);
      const now = new Date();
      const next: ProviderModel = {
        id,
        providerId: input.providerId,
        baseUrl: input.baseUrl,
        imageModel: input.imageModel,
        state: input.state,
        cooldownMs: input.cooldownMs,
        openedAt: input.openedAt ?? existing?.openedAt ?? null,
        openUntil: input.openUntil ?? existing?.openUntil ?? null,
        lastFailureReason: input.lastFailureReason ?? existing?.lastFailureReason ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      providerModels.set(id, next);
      return next;
    },

    async getProviderModel(providerModelId: string) {
      return providerModels.get(providerModelId) ?? null;
    },

    async getProviderModelByKey(baseUrl: string, imageModel: string) {
      return [...providerModels.values()].find((model) => model.baseUrl === baseUrl && model.imageModel === imageModel) ?? null;
    },

    async updateProviderModel(providerModelId: string, patch: Partial<ProviderModel>) {
      const model = requireExisting(providerModels, providerModelId, "Provider model");
      const next = { ...model, ...patch, id: model.id, updatedAt: new Date() };
      providerModels.set(providerModelId, next);
      return next;
    },

    async listProviderModels() {
      return [...providerModels.values()].sort((left, right) => left.id.localeCompare(right.id));
    },

    async createProviderApiKey(input: CreateProviderApiKeyInput) {
      const now = new Date();
      const key: ProviderApiKey = {
        id: nextId("provider-api-key"),
        providerModelId: input.providerModelId,
        label: input.label,
        keyCiphertext: input.keyCiphertext,
        enabled: true,
        state: "healthy",
        cooldownUntil: null,
        maxInFlight: input.maxInFlight,
        createdAt: now,
        updatedAt: now,
      };
      providerApiKeys.set(key.id, key);
      return key;
    },

    async listProviderApiKeys(providerModelId: string) {
      return [...providerApiKeys.values()].filter((key) => key.providerModelId === providerModelId);
    },

    async updateProviderApiKey(apiKeyId: string, patch: Partial<ProviderApiKey>) {
      const key = requireExisting(providerApiKeys, apiKeyId, "Provider API key");
      const next = { ...key, ...patch, id: key.id, updatedAt: new Date() };
      providerApiKeys.set(apiKeyId, next);
      return next;
    },

    async recordProviderHealthEvent(input: RecordProviderHealthEventInput) {
      const event: ProviderModelHealthEvent = {
        id: nextId("provider-health-event"),
        providerModelId: input.providerModelId,
        apiKeyId: input.apiKeyId ?? null,
        status: input.status,
        latencyMs: input.latencyMs ?? null,
        imageBytes: input.imageBytes ?? null,
        message: input.message,
        createdAt: new Date(),
      };
      healthEvents.set(event.id, event);
      return event;
    },

    async listProviderHealthEvents(providerModelId: string, limit = 50) {
      return [...healthEvents.values()]
        .filter((event) => event.providerModelId === providerModelId)
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
        .slice(0, limit);
    },

    async addCreditLedgerEvent(input: AddCreditLedgerEventInput) {
      const createdAt = input.createdAt ?? new Date();
      const event: CreditLedgerEvent = {
        id: nextId("credit-ledger"),
        userId: input.userId,
        eventType: input.eventType,
        amount: input.amount,
        reason: input.reason,
        createdAt,
      };
      ledgerEvents.set(event.id, event);
      const current = balances.get(input.userId) ?? 0;
      balances.set(input.userId, current + input.amount);
      return event;
    },

    async getCreditBalance(userId: string) {
      return balances.get(userId) ?? 0;
    },

    async listCreditLedgerEvents(userId: string) {
      return [...ledgerEvents.values()]
        .filter((event) => event.userId === userId)
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
    },

    async createGenerationJob(input: CreateGenerationJobInput) {
      const now = new Date();
      const job: GenerationJob = {
        id: nextId("job"),
        userId: input.userId,
        mode: input.mode,
        prompt: input.prompt,
        imageModel: input.imageModel,
        status: input.status,
        selectedApiKeyId: null,
        errorCategory: null,
        size: input.size ?? null,
        quality: input.quality ?? null,
        resolution: input.resolution ?? null,
        referenceImageCount: input.referenceImageCount ?? 0,
        timeoutMs: input.timeoutMs ?? 240000,
        createdAt: now,
        updatedAt: now,
      };
      jobs.set(job.id, job);
      return job;
    },

    async updateGenerationJob(jobId: string, patch: Partial<GenerationJob>) {
      const current = requireExisting(jobs, jobId, "Generation job");
      const next = { ...current, ...patch, id: current.id, updatedAt: new Date() };
      jobs.set(jobId, next);
      return next;
    },

    async getGenerationJob(jobId: string) {
      return jobs.get(jobId) ?? null;
    },

    async listUserActiveGenerationJobs(userId: string) {
      return [...jobs.values()].filter(
        (job) => job.userId === userId && (job.status === "queued" || job.status === "running"),
      );
    },

    async createGenerationResult(input: CreateGenerationResultInput) {
      const result: GenerationResult = {
        id: nextId("generation-result"),
        jobId: input.jobId,
        storagePath: input.storagePath,
        mimeType: input.mimeType,
        bytes: input.bytes,
        width: input.width ?? null,
        height: input.height ?? null,
        createdAt: new Date(),
      };
      results.set(result.id, result);
      return result;
    },

    async getGenerationResults(jobId: string) {
      return [...results.values()].filter((result) => result.jobId === jobId);
    },

    async createPayment(input: CreatePaymentInput) {
      const now = new Date();
      const payment: Payment = {
        id: nextId("payment"),
        userId: input.userId,
        amountCny: input.amountCny,
        credits: input.credits,
        status: input.status,
        note: input.note ?? null,
        createdAt: now,
        updatedAt: now,
      };
      payments.set(payment.id, payment);
      return payment;
    },

    async updatePayment(paymentId: string, patch: Partial<Payment>) {
      const payment = requireExisting(payments, paymentId, "Payment");
      const next = { ...payment, ...patch, id: payment.id, updatedAt: new Date() };
      payments.set(paymentId, next);
      return next;
    },

    async getPayment(paymentId: string) {
      return payments.get(paymentId) ?? null;
    },

    async listPayments(userId?: string) {
      return [...payments.values()].filter((payment) => !userId || payment.userId === userId);
    },

    async recordAdminAuditLog(input: RecordAdminAuditLogInput) {
      const log: AdminAuditLog = {
        id: nextId("admin-audit"),
        adminUserId: input.adminUserId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        detail: input.detail,
        createdAt: new Date(),
      };
      auditLogs.set(log.id, log);
      return log;
    },

    async setAppSetting(key: string, value: unknown) {
      const setting: AppSetting = {
        key,
        value,
        updatedAt: new Date(),
      };
      settings.set(key, setting);
      return setting;
    },

    async getAppSetting(key: string) {
      return settings.get(key)?.value ?? null;
    },

    async listAppSettings() {
      return [...settings.values()].sort((left, right) => left.key.localeCompare(right.key));
    },
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function requireExisting<T>(records: Map<string, T>, id: string, label: string): T {
  const record = records.get(id);
  if (!record) {
    throw new Error(`${label} not found: ${id}`);
  }
  return record;
}

function findProviderModelId(records: Map<string, ProviderModel>, baseUrl: string, imageModel: string): string | null {
  return [...records.values()].find((model) => model.baseUrl === baseUrl && model.imageModel === imageModel)?.id ?? null;
}
