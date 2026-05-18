import { and, desc, eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";
import type {
  AddCreditLedgerEventInput,
  CreateEmailVerificationCodeInput,
  CreateGenerationJobInput,
  CreateGenerationResultInput,
  CreatePaymentInput,
  CreateProviderApiKeyInput,
  CreateSessionInput,
  CreateUserInput,
  PlatformRepository,
  RecordAdminAuditLogInput,
  RecordProviderHealthEventInput,
  UpsertPromptTemplateInput,
  UpsertProviderModelInput,
} from "./repository";

export type PlatformDrizzleDatabase = NodePgDatabase<typeof schema>;

export type DrizzleRepositoryOptions = {
  db: PlatformDrizzleDatabase;
  now?: () => Date;
  idFactory?: (prefix: string) => string;
};

export function createNodePgDrizzleClient(connectionString: string) {
  const pool = new Pool({ connectionString });
  return {
    pool,
    db: drizzle(pool, { schema }),
  };
}

export function createDrizzlePlatformRepository(options: DrizzleRepositoryOptions): PlatformRepository {
  const now = options.now ?? (() => new Date());
  const idFactory = options.idFactory ?? createDefaultId;
  const db = options.db;

  return {
    async createUser(input: CreateUserInput) {
      const [user] = await db
        .insert(schema.users)
        .values({ id: idFactory("user"), email: normalizeEmail(input.email), disabled: false, createdAt: now() })
        .returning();
      return requireRow(user, "User insert failed");
    },

    async getUser(userId: string) {
      const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
      return user ?? null;
    },

    async getUserByEmail(email: string) {
      const [user] = await db.select().from(schema.users).where(eq(schema.users.email, normalizeEmail(email))).limit(1);
      return user ?? null;
    },

    async listUsers(limit = 50) {
      return await db.select().from(schema.users).orderBy(desc(schema.users.createdAt), desc(schema.users.id)).limit(limit);
    },

    async setUserDisabled(userId: string, disabled: boolean) {
      const [user] = await db
        .update(schema.users)
        .set({ disabled })
        .where(eq(schema.users.id, userId))
        .returning();
      return requireRow(user, `User not found: ${userId}`);
    },

    async createEmailVerificationCode(input: CreateEmailVerificationCodeInput) {
      const [code] = await db
        .insert(schema.emailVerificationCodes)
        .values({
          id: idFactory("verification-code"),
          email: normalizeEmail(input.email),
          codeHash: input.codeHash,
          expiresAt: input.expiresAt,
          usedAt: null,
          attempts: 0,
          ipAddress: input.ipAddress ?? null,
          createdAt: now(),
        })
        .returning();
      return requireRow(code, "Verification code insert failed");
    },

    async getLatestEmailVerificationCode(email: string) {
      const [code] = await db
        .select()
        .from(schema.emailVerificationCodes)
        .where(eq(schema.emailVerificationCodes.email, normalizeEmail(email)))
        .orderBy(desc(schema.emailVerificationCodes.createdAt))
        .limit(1);
      return code ?? null;
    },

    async markEmailVerificationCodeUsed(codeId: string, usedAt: Date) {
      const [code] = await db
        .update(schema.emailVerificationCodes)
        .set({ usedAt })
        .where(eq(schema.emailVerificationCodes.id, codeId))
        .returning();
      return requireRow(code, `Verification code not found: ${codeId}`);
    },

    async incrementEmailVerificationCodeAttempts(codeId: string) {
      const current = await getExistingVerificationCode(db, codeId);
      const [code] = await db
        .update(schema.emailVerificationCodes)
        .set({ attempts: current.attempts + 1 })
        .where(eq(schema.emailVerificationCodes.id, codeId))
        .returning();
      return requireRow(code, `Verification code not found: ${codeId}`);
    },

    async createSession(input: CreateSessionInput) {
      const [session] = await db
        .insert(schema.sessions)
        .values({
          id: idFactory("session"),
          userId: input.userId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          revokedAt: null,
          createdAt: now(),
        })
        .returning();
      return requireRow(session, "Session insert failed");
    },

    async getSessionByTokenHash(tokenHash: string) {
      const [session] = await db.select().from(schema.sessions).where(eq(schema.sessions.tokenHash, tokenHash)).limit(1);
      return session ?? null;
    },

    async revokeSession(sessionId: string, revokedAt: Date) {
      const [session] = await db
        .update(schema.sessions)
        .set({ revokedAt })
        .where(eq(schema.sessions.id, sessionId))
        .returning();
      return requireRow(session, `Session not found: ${sessionId}`);
    },

    async upsertPromptTemplate(input: UpsertPromptTemplateInput) {
      const existing = await this.listPromptTemplates().then((templates) => templates.find((template) => template.id === input.id));
      const [template] = await db
        .insert(schema.promptTemplates)
        .values({
          ...input,
          sourceUrl: input.sourceUrl ?? null,
          license: input.license ?? null,
          createdAt: existing?.createdAt ?? now(),
          updatedAt: now(),
        })
        .onConflictDoUpdate({
          target: schema.promptTemplates.id,
          set: {
            category: input.category,
            title: input.title,
            description: input.description,
            prompt: input.prompt,
            variables: input.variables,
            sourceUrl: input.sourceUrl ?? null,
            license: input.license ?? null,
            enabled: input.enabled,
            updatedAt: now(),
          },
        })
        .returning();
      return requireRow(template, "Prompt template upsert failed") as never;
    },

    async listPromptTemplates() {
      return (await db.select().from(schema.promptTemplates).orderBy(schema.promptTemplates.id)) as never;
    },

    async setPromptTemplateEnabled(templateId: string, enabled: boolean) {
      const [template] = await db
        .update(schema.promptTemplates)
        .set({ enabled, updatedAt: now() })
        .where(eq(schema.promptTemplates.id, templateId))
        .returning();
      return requireRow(template, `Prompt template not found: ${templateId}`) as never;
    },

    async upsertProviderModel(input: UpsertProviderModelInput) {
      const existing = await this.getProviderModelByKey(input.baseUrl, input.imageModel);
      const id = input.id ?? existing?.id ?? idFactory("provider-model");
      const [model] = await db
        .insert(schema.providerModels)
        .values({
          id,
          providerId: input.providerId,
          baseUrl: input.baseUrl,
          imageModel: input.imageModel,
          state: input.state,
          cooldownMs: input.cooldownMs,
          openedAt: input.openedAt ?? existing?.openedAt ?? null,
          openUntil: input.openUntil ?? existing?.openUntil ?? null,
          lastFailureReason: input.lastFailureReason ?? existing?.lastFailureReason ?? null,
          createdAt: existing?.createdAt ?? now(),
          updatedAt: now(),
        })
        .onConflictDoUpdate({
          target: schema.providerModels.id,
          set: {
            providerId: input.providerId,
            baseUrl: input.baseUrl,
            imageModel: input.imageModel,
            state: input.state,
            cooldownMs: input.cooldownMs,
            openedAt: input.openedAt ?? existing?.openedAt ?? null,
            openUntil: input.openUntil ?? existing?.openUntil ?? null,
            lastFailureReason: input.lastFailureReason ?? existing?.lastFailureReason ?? null,
            updatedAt: now(),
          },
        })
        .returning();
      return requireRow(model, "Provider model upsert failed") as never;
    },

    async getProviderModel(providerModelId: string) {
      const [model] = await db.select().from(schema.providerModels).where(eq(schema.providerModels.id, providerModelId)).limit(1);
      return (model ?? null) as never;
    },

    async getProviderModelByKey(baseUrl: string, imageModel: string) {
      const [model] = await db
        .select()
        .from(schema.providerModels)
        .where(and(eq(schema.providerModels.baseUrl, baseUrl), eq(schema.providerModels.imageModel, imageModel)))
        .limit(1);
      return (model ?? null) as never;
    },

    async updateProviderModel(providerModelId: string, patch) {
      const [model] = await db
        .update(schema.providerModels)
        .set({ ...patch, id: undefined, updatedAt: now() } as never)
        .where(eq(schema.providerModels.id, providerModelId))
        .returning();
      return requireRow(model, `Provider model not found: ${providerModelId}`) as never;
    },

    async listProviderModels() {
      return (await db.select().from(schema.providerModels).orderBy(schema.providerModels.id)) as never;
    },

    async createProviderApiKey(input: CreateProviderApiKeyInput) {
      const [key] = await db
        .insert(schema.providerApiKeys)
        .values({
          id: idFactory("provider-api-key"),
          providerModelId: input.providerModelId,
          label: input.label,
          keyCiphertext: input.keyCiphertext,
          enabled: true,
          state: "healthy",
          cooldownUntil: null,
          maxInFlight: input.maxInFlight,
          createdAt: now(),
          updatedAt: now(),
        })
        .returning();
      return requireRow(key, "Provider API key insert failed") as never;
    },

    async listProviderApiKeys(providerModelId: string) {
      return (await db.select().from(schema.providerApiKeys).where(eq(schema.providerApiKeys.providerModelId, providerModelId))) as never;
    },

    async updateProviderApiKey(apiKeyId: string, patch) {
      const [key] = await db
        .update(schema.providerApiKeys)
        .set({ ...patch, id: undefined, updatedAt: now() } as never)
        .where(eq(schema.providerApiKeys.id, apiKeyId))
        .returning();
      return requireRow(key, `Provider API key not found: ${apiKeyId}`) as never;
    },

    async recordProviderHealthEvent(input: RecordProviderHealthEventInput) {
      const [event] = await db
        .insert(schema.providerModelHealthEvents)
        .values({
          id: idFactory("provider-health-event"),
          providerModelId: input.providerModelId,
          apiKeyId: input.apiKeyId ?? null,
          status: input.status,
          latencyMs: input.latencyMs ?? null,
          imageBytes: input.imageBytes ?? null,
          message: input.message,
          createdAt: now(),
        })
        .returning();
      return requireRow(event, "Provider health event insert failed") as never;
    },

    async listProviderHealthEvents(providerModelId: string, limit = 50) {
      return (await db
        .select()
        .from(schema.providerModelHealthEvents)
        .where(eq(schema.providerModelHealthEvents.providerModelId, providerModelId))
        .orderBy(desc(schema.providerModelHealthEvents.createdAt))
        .limit(limit)) as never;
    },

    async addCreditLedgerEvent(input: AddCreditLedgerEventInput) {
      const eventTime = input.createdAt ?? now();
      const [event] = await db
        .insert(schema.creditLedger)
        .values({
          id: idFactory("credit-ledger"),
          userId: input.userId,
          eventType: input.eventType,
          amount: input.amount,
          reason: input.reason,
          createdAt: eventTime,
        })
        .returning();
      await upsertCreditAccount(db, input.userId, input.amount, eventTime);
      return requireRow(event, "Credit ledger insert failed") as never;
    },

    async getCreditBalance(userId: string) {
      const [account] = await db
        .select()
        .from(schema.userCreditAccounts)
        .where(eq(schema.userCreditAccounts.userId, userId))
        .limit(1);
      return account?.balance ?? 0;
    },

    async listCreditLedgerEvents(userId: string) {
      return (await db.select().from(schema.creditLedger).where(eq(schema.creditLedger.userId, userId))) as never;
    },

    async createGenerationJob(input: CreateGenerationJobInput) {
      const createdAt = now();
      const [job] = await db
        .insert(schema.generationJobs)
        .values({
          id: idFactory("job"),
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
          createdAt,
          updatedAt: createdAt,
        })
        .returning();
      return requireRow(job, "Generation job insert failed") as never;
    },

    async updateGenerationJob(jobId: string, patch) {
      const [job] = await db
        .update(schema.generationJobs)
        .set({ ...patch, id: undefined, updatedAt: now() } as never)
        .where(eq(schema.generationJobs.id, jobId))
        .returning();
      return requireRow(job, `Generation job not found: ${jobId}`) as never;
    },

    async getGenerationJob(jobId: string) {
      const [job] = await db.select().from(schema.generationJobs).where(eq(schema.generationJobs.id, jobId)).limit(1);
      return (job ?? null) as never;
    },

    async listUserGenerationJobs(userId: string, limit = 50) {
      return (await db
        .select()
        .from(schema.generationJobs)
        .where(eq(schema.generationJobs.userId, userId))
        .orderBy(desc(schema.generationJobs.updatedAt), desc(schema.generationJobs.id))
        .limit(limit)) as never;
    },

    async listUserActiveGenerationJobs(userId: string) {
      const rows = await db.select().from(schema.generationJobs).where(eq(schema.generationJobs.userId, userId));
      return rows.filter((job) => job.status === "queued" || job.status === "running") as never;
    },

    async createGenerationResult(input: CreateGenerationResultInput) {
      const [result] = await db
        .insert(schema.generationResults)
        .values({
          id: idFactory("generation-result"),
          jobId: input.jobId,
          storagePath: input.storagePath,
          mimeType: input.mimeType,
          bytes: input.bytes,
          width: input.width ?? null,
          height: input.height ?? null,
          createdAt: now(),
        })
        .returning();
      return requireRow(result, "Generation result insert failed");
    },

    async getGenerationResults(jobId: string) {
      return await db.select().from(schema.generationResults).where(eq(schema.generationResults.jobId, jobId));
    },

    async createPayment(input: CreatePaymentInput) {
      const createdAt = now();
      const [payment] = await db
        .insert(schema.payments)
        .values({
          id: idFactory("payment"),
          userId: input.userId,
          amountCny: input.amountCny,
          credits: input.credits,
          status: input.status,
          note: input.note ?? null,
          createdAt,
          updatedAt: createdAt,
        })
        .returning();
      return requireRow(payment, "Payment insert failed") as never;
    },

    async updatePayment(paymentId: string, patch) {
      const [payment] = await db
        .update(schema.payments)
        .set({ ...patch, id: undefined, updatedAt: now() } as never)
        .where(eq(schema.payments.id, paymentId))
        .returning();
      return requireRow(payment, `Payment not found: ${paymentId}`) as never;
    },

    async getPayment(paymentId: string) {
      const [payment] = await db.select().from(schema.payments).where(eq(schema.payments.id, paymentId)).limit(1);
      return (payment ?? null) as never;
    },

    async listPayments(userId?: string) {
      const query = db.select().from(schema.payments);
      return (userId ? await query.where(eq(schema.payments.userId, userId)) : await query) as never;
    },

    async recordAdminAuditLog(input: RecordAdminAuditLogInput) {
      const [log] = await db
        .insert(schema.adminAuditLogs)
        .values({
          id: idFactory("admin-audit"),
          adminUserId: input.adminUserId,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          detail: input.detail,
          createdAt: now(),
        })
        .returning();
      return requireRow(log, "Admin audit log insert failed");
    },

    async setAppSetting(key: string, value: unknown) {
      const [setting] = await db
        .insert(schema.appSettings)
        .values({ key, value, updatedAt: now() })
        .onConflictDoUpdate({ target: schema.appSettings.key, set: { value, updatedAt: now() } })
        .returning();
      return requireRow(setting, "App setting upsert failed");
    },

    async getAppSetting(key: string) {
      const [setting] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, key)).limit(1);
      return setting?.value ?? null;
    },

    async listAppSettings() {
      return await db.select().from(schema.appSettings).orderBy(schema.appSettings.key);
    },
  };
}

async function getExistingVerificationCode(db: PlatformDrizzleDatabase, codeId: string) {
  const [code] = await db
    .select()
    .from(schema.emailVerificationCodes)
    .where(eq(schema.emailVerificationCodes.id, codeId))
    .limit(1);
  return requireRow(code, `Verification code not found: ${codeId}`);
}

async function upsertCreditAccount(db: PlatformDrizzleDatabase, userId: string, amount: number, updatedAt: Date) {
  const [account] = await db
    .select()
    .from(schema.userCreditAccounts)
    .where(eq(schema.userCreditAccounts.userId, userId))
    .limit(1);

  if (!account) {
    await db.insert(schema.userCreditAccounts).values({ userId, balance: amount, updatedAt });
    return;
  }

  await db
    .update(schema.userCreditAccounts)
    .set({ balance: account.balance + amount, updatedAt })
    .where(eq(schema.userCreditAccounts.userId, userId));
}

function requireRow<T>(row: T | undefined, message: string): T {
  if (!row) {
    throw new Error(message);
  }
  return row;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function createDefaultId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
