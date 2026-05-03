import { parseHostedProviderApiKeys } from "./runtime";

export type ProductionEnvValidation = {
  ok: boolean;
  errors: string[];
};

export function validateProductionEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): ProductionEnvValidation {
  const errors: string[] = [];

  requireValue(env.DATABASE_URL, "DATABASE_URL", errors);
  requireValue(env.REDIS_URL, "REDIS_URL", errors);
  requireValue(env.SMTP_HOST, "SMTP_HOST", errors);
  requireValue(env.PLATFORM_ADMIN_TOKEN, "PLATFORM_ADMIN_TOKEN", errors);
  requireValue(env.PLATFORM_OUTPUT_DIR, "PLATFORM_OUTPUT_DIR", errors);

  if (parseHostedProviderApiKeys(env).length === 0) {
    errors.push("At least one hosted API key is required.");
  }

  if (env.SMTP_PORT && !isPositiveInteger(env.SMTP_PORT)) {
    errors.push("SMTP_PORT must be a positive integer.");
  }

  if (env.GENERATION_JOB_TIMEOUT_MS && !isPositiveInteger(env.GENERATION_JOB_TIMEOUT_MS)) {
    errors.push("GENERATION_JOB_TIMEOUT_MS must be a positive integer.");
  }

  return { ok: errors.length === 0, errors };
}

function requireValue(value: string | undefined, name: string, errors: string[]) {
  if (!value?.trim()) {
    errors.push(`${name} is required.`);
  }
}

function isPositiveInteger(value: string): boolean {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0;
}
