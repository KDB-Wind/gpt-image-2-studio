import { boolean, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  disabled: boolean("disabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const emailVerificationCodes = pgTable("email_verification_codes", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  attempts: integer("attempts").notNull().default(0),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const promptTemplates = pgTable("prompt_templates", {
  id: text("id").primaryKey(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  prompt: text("prompt").notNull(),
  variables: jsonb("variables").notNull().default([]),
  sourceUrl: text("source_url"),
  license: text("license"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const providerModels = pgTable("provider_models", {
  id: text("id").primaryKey(),
  providerId: text("provider_id").notNull(),
  baseUrl: text("base_url").notNull(),
  imageModel: text("image_model").notNull(),
  state: text("state").notNull().default("closed"),
  cooldownMs: integer("cooldown_ms").notNull().default(300000),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  openUntil: timestamp("open_until", { withTimezone: true }),
  lastFailureReason: text("last_failure_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const providerApiKeys = pgTable("provider_api_keys", {
  id: text("id").primaryKey(),
  providerModelId: text("provider_model_id").notNull(),
  label: text("label").notNull(),
  keyCiphertext: text("key_ciphertext").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  state: text("state").notNull().default("healthy"),
  cooldownUntil: timestamp("cooldown_until", { withTimezone: true }),
  maxInFlight: integer("max_in_flight").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const providerModelHealthEvents = pgTable("provider_model_health_events", {
  id: text("id").primaryKey(),
  providerModelId: text("provider_model_id").notNull(),
  apiKeyId: text("api_key_id"),
  status: text("status").notNull(),
  latencyMs: integer("latency_ms"),
  imageBytes: integer("image_bytes"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const generationJobs = pgTable("generation_jobs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  mode: text("mode").notNull(),
  prompt: text("prompt").notNull(),
  imageModel: text("image_model").notNull(),
  status: text("status").notNull(),
  selectedApiKeyId: text("selected_api_key_id"),
  errorCategory: text("error_category"),
  size: text("size"),
  quality: text("quality"),
  resolution: text("resolution"),
  referenceImageCount: integer("reference_image_count").notNull().default(0),
  timeoutMs: integer("timeout_ms").notNull().default(240000),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const generationResults = pgTable("generation_results", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull(),
  storagePath: text("storage_path").notNull(),
  mimeType: text("mime_type").notNull(),
  bytes: integer("bytes").notNull(),
  width: integer("width"),
  height: integer("height"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userCreditAccounts = pgTable("user_credit_accounts", {
  userId: text("user_id").primaryKey(),
  balance: integer("balance").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const creditLedger = pgTable("credit_ledger", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  eventType: text("event_type").notNull(),
  amount: integer("amount").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const payments = pgTable("payments", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  amountCny: integer("amount_cny").notNull(),
  credits: integer("credits").notNull(),
  status: text("status").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const adminAuditLogs = pgTable("admin_audit_logs", {
  id: text("id").primaryKey(),
  adminUserId: text("admin_user_id").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  detail: jsonb("detail").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const platformTables = [
  "users",
  "email_verification_codes",
  "sessions",
  "prompt_templates",
  "provider_models",
  "provider_api_keys",
  "provider_model_health_events",
  "generation_jobs",
  "generation_results",
  "user_credit_accounts",
  "credit_ledger",
  "payments",
  "admin_audit_logs",
  "app_settings",
] as const;

export type PlatformTableName = (typeof platformTables)[number];
