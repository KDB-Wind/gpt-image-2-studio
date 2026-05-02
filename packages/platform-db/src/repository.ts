export type User = {
  id: string;
  email: string;
  disabled: boolean;
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
  createdAt: Date;
  updatedAt: Date;
};

export type CreateUserInput = {
  email: string;
};

export type AddCreditLedgerEventInput = {
  userId: string;
  eventType: CreditLedgerEventType;
  amount: number;
  reason: string;
};

export type CreateGenerationJobInput = {
  userId: string;
  mode: GenerationJob["mode"];
  prompt: string;
  imageModel: string;
  status: GenerationJobStatus;
};

export type PlatformRepository = {
  createUser(input: CreateUserInput): Promise<User>;
  getUser(userId: string): Promise<User | null>;
  addCreditLedgerEvent(input: AddCreditLedgerEventInput): Promise<void>;
  getCreditBalance(userId: string): Promise<number>;
  createGenerationJob(input: CreateGenerationJobInput): Promise<GenerationJob>;
  updateGenerationJob(jobId: string, patch: Partial<GenerationJob>): Promise<GenerationJob>;
  getGenerationJob(jobId: string): Promise<GenerationJob | null>;
};
