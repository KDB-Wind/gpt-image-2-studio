import { describe, expect, it } from "vitest";
import { getTableName } from "drizzle-orm";

import {
  adminAuditLogs,
  appSettings,
  creditLedger,
  emailVerificationCodes,
  generationJobs,
  generationResults,
  payments,
  platformTables,
  promptTemplates,
  providerApiKeys,
  providerModelHealthEvents,
  providerModels,
  sessions,
  userCreditAccounts,
  users,
} from "./schema";

describe("platform schema", () => {
  it("declares every table required by the hosted platform MVP", () => {
    expect(platformTables).toEqual([
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
    ]);
  });

  it("maps table exports to stable PostgreSQL table names", () => {
    expect([
      users,
      emailVerificationCodes,
      sessions,
      promptTemplates,
      providerModels,
      providerApiKeys,
      providerModelHealthEvents,
      generationJobs,
      generationResults,
      userCreditAccounts,
      creditLedger,
      payments,
      adminAuditLogs,
      appSettings,
    ].map((table) => getTableName(table))).toEqual(platformTables);
  });
});
