export type User = {
  id: string;
  email: string;
  disabled: boolean;
  createdAt: Date;
};

export type EmailVerificationCode = {
  id: string;
  email: string;
  codeHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  attempts: number;
  ipAddress: string | null;
  createdAt: Date;
};

export type Session = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
};

export type PromptTemplateCategory = "portrait" | "graduation" | "product" | "poster" | "avatar" | "scene";

export type PromptTemplateVariable = {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
};

export type PromptTemplate = {
  id: string;
  category: PromptTemplateCategory;
  title: string;
  description: string;
  prompt: string;
  variables: PromptTemplateVariable[];
  sourceUrl: string | null;
  license: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type ProviderModelState = "closed" | "open" | "half_open" | "maintenance";

export type ProviderModel = {
  id: string;
  providerId: string;
  baseUrl: string;
  imageModel: string;
  state: ProviderModelState;
  cooldownMs: number;
  openedAt: Date | null;
  openUntil: Date | null;
  lastFailureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ProviderApiKeyState = "healthy" | "cooldown" | "disabled";

export type ProviderApiKey = {
  id: string;
  providerModelId: string;
  label: string;
  keyCiphertext: string;
  enabled: boolean;
  state: ProviderApiKeyState;
  cooldownUntil: Date | null;
  maxInFlight: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ProviderHealthStatus = "success" | "failure" | "skipped";

export type ProviderModelHealthEvent = {
  id: string;
  providerModelId: string;
  apiKeyId: string | null;
  status: ProviderHealthStatus;
  latencyMs: number | null;
  imageBytes: number | null;
  message: string;
  createdAt: Date;
};

export type CreditLedgerEventType =
  | "daily_free_grant"
  | "admin_adjustment"
  | "manual_payment_credit"
  | "generation_debit"
  | "generation_refund"
  | "provider_failure_no_charge"
  | "provider_circuit_open_no_charge";

export type CreditLedgerEvent = {
  id: string;
  userId: string;
  eventType: CreditLedgerEventType;
  amount: number;
  reason: string;
  createdAt: Date;
};

export type GenerationJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "provider_circuit_open";

export type GenerationJob = {
  id: string;
  userId: string;
  mode: "hosted" | "bring_your_own_key";
  prompt: string;
  imageModel: string;
  status: GenerationJobStatus;
  selectedApiKeyId: string | null;
  errorCategory: string | null;
  size: string | null;
  quality: string | null;
  resolution: string | null;
  referenceImageCount: number;
  timeoutMs: number;
  createdAt: Date;
  updatedAt: Date;
};

export type GenerationResult = {
  id: string;
  jobId: string;
  storagePath: string;
  mimeType: string;
  bytes: number;
  width: number | null;
  height: number | null;
  createdAt: Date;
};

export type PaymentStatus = "pending" | "approved" | "rejected";

export type Payment = {
  id: string;
  userId: string;
  amountCny: number;
  credits: number;
  status: PaymentStatus;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AdminAuditLog = {
  id: string;
  adminUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  detail: unknown;
  createdAt: Date;
};

export type AppSetting = {
  key: string;
  value: unknown;
  updatedAt: Date;
};

export type CreateUserInput = {
  email: string;
};

export type CreateEmailVerificationCodeInput = {
  email: string;
  codeHash: string;
  expiresAt: Date;
  ipAddress?: string | null;
};

export type CreateSessionInput = {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
};

export type UpsertPromptTemplateInput = Omit<PromptTemplate, "createdAt" | "updatedAt">;

export type UpsertProviderModelInput = {
  id?: string;
  providerId: string;
  baseUrl: string;
  imageModel: string;
  state: ProviderModelState;
  cooldownMs: number;
  openedAt?: Date | null;
  openUntil?: Date | null;
  lastFailureReason?: string | null;
};

export type CreateProviderApiKeyInput = {
  providerModelId: string;
  label: string;
  keyCiphertext: string;
  maxInFlight: number;
};

export type RecordProviderHealthEventInput = {
  providerModelId: string;
  apiKeyId?: string | null;
  status: ProviderHealthStatus;
  latencyMs?: number | null;
  imageBytes?: number | null;
  message: string;
};

export type AddCreditLedgerEventInput = {
  userId: string;
  eventType: CreditLedgerEventType;
  amount: number;
  reason: string;
  createdAt?: Date;
};

export type CreateGenerationJobInput = {
  userId: string;
  mode: GenerationJob["mode"];
  prompt: string;
  imageModel: string;
  status: GenerationJobStatus;
  size?: string | null;
  quality?: string | null;
  resolution?: string | null;
  referenceImageCount?: number;
  timeoutMs?: number;
};

export type CreateGenerationResultInput = {
  jobId: string;
  storagePath: string;
  mimeType: string;
  bytes: number;
  width?: number | null;
  height?: number | null;
};

export type CreatePaymentInput = {
  userId: string;
  amountCny: number;
  credits: number;
  status: PaymentStatus;
  note?: string | null;
};

export type RecordAdminAuditLogInput = {
  adminUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  detail: unknown;
};

export type PlatformRepository = {
  createUser(input: CreateUserInput): Promise<User>;
  getUser(userId: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  setUserDisabled(userId: string, disabled: boolean): Promise<User>;

  createEmailVerificationCode(input: CreateEmailVerificationCodeInput): Promise<EmailVerificationCode>;
  getLatestEmailVerificationCode(email: string): Promise<EmailVerificationCode | null>;
  markEmailVerificationCodeUsed(codeId: string, usedAt: Date): Promise<EmailVerificationCode>;
  incrementEmailVerificationCodeAttempts(codeId: string): Promise<EmailVerificationCode>;

  createSession(input: CreateSessionInput): Promise<Session>;
  getSessionByTokenHash(tokenHash: string): Promise<Session | null>;
  revokeSession(sessionId: string, revokedAt: Date): Promise<Session>;

  upsertPromptTemplate(input: UpsertPromptTemplateInput): Promise<PromptTemplate>;
  listPromptTemplates(): Promise<PromptTemplate[]>;
  setPromptTemplateEnabled(templateId: string, enabled: boolean): Promise<PromptTemplate>;

  upsertProviderModel(input: UpsertProviderModelInput): Promise<ProviderModel>;
  getProviderModel(providerModelId: string): Promise<ProviderModel | null>;
  getProviderModelByKey(baseUrl: string, imageModel: string): Promise<ProviderModel | null>;
  updateProviderModel(providerModelId: string, patch: Partial<ProviderModel>): Promise<ProviderModel>;
  listProviderModels(): Promise<ProviderModel[]>;

  createProviderApiKey(input: CreateProviderApiKeyInput): Promise<ProviderApiKey>;
  listProviderApiKeys(providerModelId: string): Promise<ProviderApiKey[]>;
  updateProviderApiKey(apiKeyId: string, patch: Partial<ProviderApiKey>): Promise<ProviderApiKey>;

  recordProviderHealthEvent(input: RecordProviderHealthEventInput): Promise<ProviderModelHealthEvent>;
  listProviderHealthEvents(providerModelId: string, limit?: number): Promise<ProviderModelHealthEvent[]>;

  addCreditLedgerEvent(input: AddCreditLedgerEventInput): Promise<CreditLedgerEvent>;
  getCreditBalance(userId: string): Promise<number>;
  listCreditLedgerEvents(userId: string): Promise<CreditLedgerEvent[]>;

  createGenerationJob(input: CreateGenerationJobInput): Promise<GenerationJob>;
  updateGenerationJob(jobId: string, patch: Partial<GenerationJob>): Promise<GenerationJob>;
  getGenerationJob(jobId: string): Promise<GenerationJob | null>;
  listUserGenerationJobs(userId: string, limit?: number): Promise<GenerationJob[]>;
  listUserActiveGenerationJobs(userId: string): Promise<GenerationJob[]>;

  createGenerationResult(input: CreateGenerationResultInput): Promise<GenerationResult>;
  getGenerationResults(jobId: string): Promise<GenerationResult[]>;

  createPayment(input: CreatePaymentInput): Promise<Payment>;
  updatePayment(paymentId: string, patch: Partial<Payment>): Promise<Payment>;
  getPayment(paymentId: string): Promise<Payment | null>;
  listPayments(userId?: string): Promise<Payment[]>;

  recordAdminAuditLog(input: RecordAdminAuditLogInput): Promise<AdminAuditLog>;

  setAppSetting(key: string, value: unknown): Promise<AppSetting>;
  getAppSetting(key: string): Promise<unknown | null>;
  listAppSettings(): Promise<AppSetting[]>;
};
