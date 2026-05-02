export const platformTables = [
  "users",
  "email_verification_codes",
  "prompt_templates",
  "provider_models",
  "provider_model_health_events",
  "api_keys",
  "generation_jobs",
  "generation_results",
  "user_credit_accounts",
  "credit_ledger",
  "payments",
  "admin_audit_logs",
] as const;

export type PlatformTableName = (typeof platformTables)[number];
